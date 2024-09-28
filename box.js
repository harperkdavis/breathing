let gl, canvas;

function setup() {
    canvas = document.querySelector("canvas");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    gl = canvas.getContext("webgl");
    if (!gl) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    const vs = `

    attribute vec2 a_position;
    varying vec2 v_texcoord;

    void main() {
        gl_Position = vec4(a_position, 0, 1);
        v_texcoord = a_position * 0.5 + 0.5;
    }

    `;
    const fs = `
    
    precision mediump float;

    uniform sampler2D u_texture;
    uniform vec2 u_scale;

    uniform vec3 u_colors[8];
    uniform vec2 u_offsets[8];
    uniform bool u_skip[8];

    varying vec2 v_texcoord;

    void main() {
        
        vec3 color = vec3(0);
        float weights[8];
        float biggestWeight = 0.0;
        float noise = texture2D(u_texture, v_texcoord * u_scale).r;
        for (int i = 0; i < 8; i++) {
            float sqrDist = pow(v_texcoord.x - u_offsets[i].x, 2.0) + pow(v_texcoord.y - u_offsets[i].y, 2.0);
            weights[i] = pow(1.0 / (sqrDist + 0.0001), 1.0);

            if (u_skip[i]) {
                weights[i] = 0.0;
            }

            if (weights[i] > biggestWeight) {
                biggestWeight = weights[i];
            }
        }

        for (int i = 0; i < 8; i++) {
            if (weights[i] == biggestWeight) {
                weights[i] *= 1.04;
            }
            
            weights[i] /= biggestWeight;
            weights[i] = pow(weights[i], 2.0);
        }

        float totalWeight = 0.0;
        for (int i = 0; i < 8; i++) {
            totalWeight += weights[i];
        }

        float sum = 0.0;
        for (int i = 0; i < 8; i++) {
            sum += weights[i];
            if (noise < sum / totalWeight) {
                color = u_colors[i];
                break;
            }
        }

        gl_FragColor = vec4(color, 1);
        
    }

    `;

    program = twgl.createProgramFromSources(gl, [vs, fs]);
    gl.useProgram(program);

    console.log(program);

    // Draw screen rectangle with texture coordinates
    const positionLocation = gl.getAttribLocation(program, "a_position");
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const noiseTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, noiseTexture);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));

    // Asynchronously load an image
    const image = new Image();
    image.src = "noise.png";

    image.addEventListener('load', function(e) {
        console.log('loaded', e);
        // Now that the image has loaded make copy it to the texture.
        gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, image);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        gl.generateMipmap(gl.TEXTURE_2D);
    });

    // Set uniforms

    const scaleLocation = gl.getUniformLocation(program, "u_scale");
    // Scale to pixel ratio
    gl.uniform2f(scaleLocation, window.devicePixelRatio, 1 / window.devicePixelRatio);
    console.log(window.devicePixelRatio);

    return createLoop(render);
}

function createLoop (callback) {
    let elapsed = 0;
    let lastTime = performance.now();
    (function loop() {
        frame = requestAnimationFrame(loop);
        const beginTime = performance.now();
        const dt = (beginTime - lastTime) / 1000;
        lastTime = beginTime;
        elapsed += dt;
        callback(elapsed, dt);
    })();
    return () => {
        cancelAnimationFrame(frame);
    };
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255,
   ] : null;
  }

function setColors(colors) {
    const colorsLocation = gl.getUniformLocation(program, "u_colors");
    const offsetsLocation = gl.getUniformLocation(program, "u_offsets");
    const skipLocation = gl.getUniformLocation(program, "u_skip");

    const colorsArray = new Float32Array(24);
    const offsetsArray = new Float32Array(16);
    const skipArray = new Uint8Array(8).fill(1);
    

    if (colors.length > 8) {
        throw new Error("Too many colors");
    }

    for (let i = 0; i < colors.length; i++) {
        const color = typeof colors[i].color === "string" ? hexToRgb(colors[i].color) : colors[i].color;

        colorsArray[i * 3] = color[0];
        colorsArray[i * 3 + 1] = color[1];
        colorsArray[i * 3 + 2] = color[2];

        offsetsArray[i * 2] = colors[i].position[0];
        offsetsArray[i * 2 + 1] = colors[i].position[1];

        skipArray[i] = 0;
    }

    gl.uniform3fv(colorsLocation, colorsArray);
    gl.uniform2fv(offsetsLocation, offsetsArray);
    gl.uniform1iv(skipLocation, skipArray);
}

function handleResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const scaleLocation = gl.getUniformLocation(program, "u_scale");
    gl.uniform2f(scaleLocation, window.devicePixelRatio, window.devicePixelRatio);

    gl.viewport(0, 0, canvas.width, canvas.height);
}

const COLORS = ['#270f36', '#632b6c', '#c76b98', '#f09f9c', '#fcc3a3'];
const noise = new Noise(Math.random());

function render() {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const now = performance.now() / 50;

    setColors(COLORS.map((color, i) => ({
        color,
        position: [noise.simplex2(now / 1000, 100 + i * 200) * 0.5 + 0.5, noise.simplex2(now / 1000, 200 + i * 200) * 0.5 + 0.5]
    })));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

document.addEventListener("DOMContentLoaded", setup);
document.addEventListener("resize", handleResize);