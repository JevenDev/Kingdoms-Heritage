#version 150

uniform sampler2D Sampler0;
uniform float Progress;
uniform vec2 Resolution;

in vec2 texCoord;

out vec4 fragColor;

float randomCell(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    vec2 blend = f * f * (3.0 - 2.0 * f);
    return mix(mix(randomCell(cell), randomCell(cell + vec2(1.0, 0.0)), blend.x),
            mix(randomCell(cell + vec2(0.0, 1.0)), randomCell(cell + vec2(1.0)), blend.x), blend.y);
}

void main() {
    vec4 color = texture(Sampler0, texCoord);
    if (color.a < 0.001) discard;
    vec2 pixel = floor(texCoord * Resolution);
    float grain = noise(pixel * 0.17) * 0.65 + noise(pixel * 0.43 + vec2(31.0, 17.0)) * 0.35;
    float threshold = Progress * 1.2 - 0.1;
    float coverage = smoothstep(threshold, threshold + 0.045, grain);
    if (coverage < 0.001) discard;
    float edge = 1.0 - smoothstep(threshold + 0.045, threshold + 0.12, grain);
    color.rgb = mix(color.rgb, vec3(0.95, 0.73, 0.40) * color.a, edge * 0.65);
    fragColor = color * coverage;
}
