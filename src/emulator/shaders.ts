/**
 * GLSL for the WebGL2 renderer.
 *
 * One fullscreen pass does everything: barrel distortion, sharp-bilinear
 * upscaling, luminance-weighted scanlines, an aperture-grille mask, cheap bloom,
 * and a vignette. Every effect is driven by a uniform so the same program covers
 * "Sharp" (all effects at zero) through "CRT" without recompiling.
 */

export const VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

// Fullscreen triangle generated from gl_VertexID — no vertex buffer needed.
out vec2 vUv;

void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2  uTexSize;      // source resolution in texels (256 x 240, less overscan)
uniform vec2  uOutSize;      // drawing buffer size in device pixels
uniform float uCurvature;    // 0 = flat panel, ~0.3 = period CRT
uniform float uScanline;     // scanline depth
uniform float uMask;         // aperture-grille strength
uniform float uBloom;        // phosphor bloom
uniform float uVignette;
uniform float uSmooth;       // 0 = crisp pixel edges, 1 = fully bilinear
uniform float uBrightness;
uniform float uSaturation;
uniform float uAberration;   // chromatic fringing toward the edges

const float PI = 3.14159265359;

/**
 * Sharp bilinear: bilinear filtering confined to a single output pixel at the
 * texel boundary. Keeps pixel art crisp at non-integer scales without the
 * shimmering that nearest-neighbour produces when the window is resized.
 */
vec2 sharpUv(vec2 uv) {
  vec2 texel = uv * uTexSize;
  vec2 scale = max(floor(uOutSize / uTexSize), vec2(1.0));
  vec2 texelFloor = floor(texel);
  vec2 f = fract(texel);
  vec2 region = 0.5 - 0.5 / scale;
  vec2 dist = f - 0.5;
  vec2 adjusted = (dist - clamp(dist, -region, region)) * scale + 0.5;
  return (texelFloor + mix(adjusted, f, uSmooth)) / uTexSize;
}

/** Barrel distortion around the screen centre. */
vec2 curve(vec2 uv) {
  if (uCurvature <= 0.001) return uv;
  vec2 c = uv * 2.0 - 1.0;
  vec2 offset = abs(c.yx) / vec2(6.0, 5.0) * uCurvature;
  c += c * offset * offset;
  return c * 0.5 + 0.5;
}

vec3 sampleScreen(vec2 uv) {
  return texture(uTex, sharpUv(uv)).rgb;
}

void main() {
  vec2 uv = curve(vUv);

  // Outside the tube after distortion: bezel, not wrapped pixels.
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 color;
  if (uAberration > 0.001) {
    // Fringing grows toward the edges, as with a real lens.
    vec2 dir = (uv - 0.5);
    float amount = uAberration * 0.003 * dot(dir, dir) * 4.0;
    color.r = sampleScreen(uv + dir * amount).r;
    color.g = sampleScreen(uv).g;
    color.b = sampleScreen(uv - dir * amount).b;
  } else {
    color = sampleScreen(uv);
  }

  // --- Bloom: 8 taps on a ring, keeping only what is brighter than mid-grey.
  if (uBloom > 0.001) {
    vec2 radius = 1.75 / uTexSize;
    vec3 sum = vec3(0.0);
    sum += sampleScreen(uv + vec2( radius.x,  0.0));
    sum += sampleScreen(uv + vec2(-radius.x,  0.0));
    sum += sampleScreen(uv + vec2( 0.0,  radius.y));
    sum += sampleScreen(uv + vec2( 0.0, -radius.y));
    sum += sampleScreen(uv + vec2( radius.x,  radius.y) * 0.7071);
    sum += sampleScreen(uv + vec2(-radius.x,  radius.y) * 0.7071);
    sum += sampleScreen(uv + vec2( radius.x, -radius.y) * 0.7071);
    sum += sampleScreen(uv + vec2(-radius.x, -radius.y) * 0.7071);
    vec3 halo = max(sum / 8.0 - 0.45, vec3(0.0));
    color += halo * uBloom * 1.6;
  }

  // --- Scanlines. The beam spreads on bright lines, so weight by luminance.
  if (uScanline > 0.001) {
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    float pos = fract(uv.y * uTexSize.y);
    float beam = mix(1.35, 0.55, lum);
    float profile = pow(abs(sin(pos * PI)), beam);
    color *= mix(1.0, profile, uScanline);
    // Scanlines halve average luminance; give it back so the picture does not
    // just look dimmer than "Sharp".
    color *= 1.0 + uScanline * 0.5;
  }

  // --- Aperture grille: vertical RGB stripes at device-pixel pitch.
  if (uMask > 0.001) {
    float stripe = mod(gl_FragCoord.x, 3.0);
    vec3 mask = stripe < 1.0
      ? vec3(1.0, 0.72, 0.72)
      : (stripe < 2.0 ? vec3(0.72, 1.0, 0.72) : vec3(0.72, 0.72, 1.0));
    color *= mix(vec3(1.0), mask, uMask);
    color *= 1.0 + uMask * 0.18;
  }

  // --- Vignette.
  if (uVignette > 0.001) {
    vec2 v = uv * (1.0 - uv.yx);
    float vig = pow(clamp(v.x * v.y * 16.0, 0.0, 1.0), 0.28);
    color *= mix(1.0, vig, uVignette);
  }

  // --- Grade.
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(lum), color, uSaturation);
  color *= uBrightness;

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
