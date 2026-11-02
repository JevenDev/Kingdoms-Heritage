#version 150

uniform vec2 Size;
uniform float Time;

in vec2 texCoord;

out vec4 fragColor;

const float BAYER[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
);

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
    vec2 pixel = floor(texCoord * Size) + 0.5;
    vec2 inset = min(pixel, Size - pixel);
    if (inset.x < 1.0 && inset.y < 1.0) discard;

    vec2 p = pixel * vec2(0.055, 0.105);
    p += vec2(Time * 0.10, -Time * 0.04);
    float cloud = noise(p + vec2(noise(p * 0.7 + Time * 0.03), 0.0));
    cloud = cloud * 0.7 + noise(p * 2.2 + vec2(11.0, 27.0)) * 0.3;
    float level = smoothstep(0.2, 0.8, cloud) * 4.0;
    ivec2 cell = ivec2(mod(floor(pixel), 4.0));
    float threshold = (BAYER[cell.x + cell.y * 4] + 0.5) / 16.0;
    float shade = (floor(level) + step(threshold, fract(level))) / 4.0;
    vec3 color = mix(vec3(0.022, 0.029, 0.047), vec3(0.075, 0.102, 0.153), shade);

    float ribbonY = 19.0 + sin(pixel.x * 0.045 - Time * 0.55) * 4.0;
    float ribbon = exp(-pow((pixel.y - ribbonY) / 5.0, 2.0));
    color += vec3(0.014, 0.020, 0.031) * ribbon;
    color *= 0.86 + 0.14 * sin(texCoord.x * 3.14159);

    float edge = min(inset.x, inset.y);
    if (edge < 1.0) {
        fragColor = vec4(16.0 / 255.0, 18.0 / 255.0, 23.0 / 255.0, 240.0 / 255.0);
        return;
    }
    if (edge < 2.0) {
        float verticalBlend = clamp((pixel.y - 1.5) / (Size.y - 3.0), 0.0, 1.0);
        vec3 tooltipColor = mix(vec3(190.0, 194.0, 201.0), vec3(121.0, 127.0, 139.0), verticalBlend) / 255.0;
        color = mix(color, tooltipColor, 0.75);

        float horizontal = Size.x - 3.0;
        float vertical = Size.y - 3.0;
        float perimeter = 2.0 * (horizontal + vertical);
        float position;
        if (pixel.y < 2.0) position = pixel.x - 1.5;
        else if (pixel.x > Size.x - 2.0) position = horizontal + pixel.y - 1.5;
        else if (pixel.y > Size.y - 2.0) position = horizontal + vertical + Size.x - 1.5 - pixel.x;
        else position = 2.0 * horizontal + vertical + Size.y - 1.5 - pixel.y;
        float head = mod(Time * perimeter / 4.0, perimeter);
        float distance = abs(position - head);
        distance = min(distance, perimeter - distance);
        float shine = exp(-pow(distance / 14.0, 2.0));
        color = mix(color, vec3(0.82, 0.84, 0.88), shine * 0.65);
    }
    fragColor = vec4(color, 0.97);
}
