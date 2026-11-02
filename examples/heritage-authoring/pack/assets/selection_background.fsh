#version 150

uniform vec2 Resolution;
uniform float Time;

out vec4 fragColor;

const float BAYER[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
);

const vec3 PALETTE[6] = vec3[6](
    vec3(0.016, 0.020, 0.035),
    vec3(0.027, 0.039, 0.063),
    vec3(0.047, 0.067, 0.102),
    vec3(0.078, 0.106, 0.149),
    vec3(0.133, 0.157, 0.208),
    vec3(0.216, 0.231, 0.282)
);

float randomCell(ivec2 cell) {
    uvec2 p = uvec2(cell);
    uint bits = p.x * 1597334677u + p.y * 3812015801u;
    bits = (bits ^ (bits >> 16u)) * 2246822519u;
    bits = (bits ^ (bits >> 13u)) * 3266489917u;
    return float((bits ^ (bits >> 16u)) & 16777215u) / 16777216.0;
}

float noise(vec2 p) {
    ivec2 cell = ivec2(floor(p));
    vec2 f = fract(p);
    vec2 blend = f * f * (3.0 - 2.0 * f);
    return mix(mix(randomCell(cell), randomCell(cell + ivec2(1, 0)), blend.x),
            mix(randomCell(cell + ivec2(0, 1)), randomCell(cell + ivec2(1, 1)), blend.x), blend.y);
}

float clouds(vec2 p) {
    return noise(p) * 0.57 + noise(p * 2.0 + vec2(13.0, 7.0)) * 0.28
            + noise(p * 4.0 - vec2(9.0, 17.0)) * 0.15;
}

void main() {
    vec2 pixel = floor(gl_FragCoord.xy);
    vec2 p = (pixel + 0.5 - Resolution * 0.5) / Resolution.y;
    float t = Time;
    float wave = 0.18 * sin(p.y * 7.0 + t * 0.28);
    wave += 0.06 * sin(p.y * 13.0 - t * 0.19);
    wave += (mod(pixel.y, 2.0) * 2.0 - 1.0) * 0.006 * sin(p.y * 11.0 + t * 0.35);
    vec2 warped = p + vec2(wave + t * 0.006, -t * 0.004);
    float cloud = smoothstep(0.26, 0.76, clouds(warped * 3.0 + vec2(8.0, 17.0)));
    float rift = smoothstep(0.50, 0.70, noise(warped * 5.0 + vec2(31.0, -4.0)));
    float density = cloud * (1.0 - rift * 0.85);
    float level = clamp(density * 5.0, 0.0, 4.999);
    int lower = int(floor(level));
    ivec2 cell = ivec2(mod(pixel, 4.0));
    float threshold = (BAYER[cell.x + cell.y * 4] + 0.5) / 16.0;
    vec3 color = mix(PALETTE[lower], PALETTE[lower + 1], step(threshold, fract(level)));
    float shift = 0.5 + 0.5 * sin(t * 0.09 + cloud * 3.0);
    color *= mix(vec3(0.87, 0.95, 1.0), vec3(1.0, 0.88, 0.98), shift);
    vec2 starSpace = (p + vec2(t * 0.002, -t * 0.001)) * 100.0;
    ivec2 starCell = ivec2(floor(starSpace));
    float seed = randomCell(starCell);
    vec2 starPosition = vec2(randomCell(starCell + ivec2(73, 19)),
            randomCell(starCell + ivec2(11, 97))) * 0.65 + 0.175;
    vec2 delta = abs(fract(starSpace) - starPosition) * Resolution.y / 100.0;
    float star = 1.0 - smoothstep(0.2, 0.85, length(delta));
    float flare = (1.0 - smoothstep(0.2, 0.5, min(delta.x, delta.y)))
            * (1.0 - smoothstep(0.8, 1.7, max(delta.x, delta.y)));
    star = max(star, flare * step(0.9996, seed) * 0.65) * step(0.996, seed);
    float twinkle = 0.72 + 0.28 * sin(t * 0.8 + seed * 120.0);
    color = mix(color, vec3(0.46, 0.51, 0.59) * twinkle, star);
    fragColor = vec4(color, 1.0);
}
