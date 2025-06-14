import { useEffect, useRef } from "react";

export type TermsModalProps = {
  onClose: () => void;
};

export default function TermsModal({ onClose }: TermsModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attackRef = useRef(false);
  const uAttackRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.gpu) {
      console.warn("WebGPU not supported");
      return;
    }
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    let mounted = true;

    (async () => {
      const adapter = await navigator.gpu.requestAdapter();
      const device = await adapter!.requestDevice();
      const context = canvas.getContext("webgpu")!;
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: "premultiplied" });

      const uniformBuffer = device.createBuffer({
        size: 4 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const shaderModule = device.createShaderModule({
        code: `
struct Uniforms {
  u_time: f32,
  u_attack: f32,
  u_width: f32,
  u_height: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn random2(st: vec2<f32>) -> f32 {
  return fract(sin(dot(st, vec2<f32>(12.9898,78.233))) * 43758.5453123);
}
fn noise(st: vec2<f32>) -> f32 {
  let i = floor(st);
  let f = fract(st);
  let u_ = f * f * (3.0 - 2.0 * f);
  return mix(mix(random2(i), random2(i + vec2<f32>(1.0,0.0)), u_.x),
             mix(random2(i + vec2<f32>(0.0,1.0)), random2(i + vec2<f32>(1.0,1.0)), u_.x),
             u_.y);
}

fn tear(uv: vec2<f32>, origin: vec2<f32>, angle: f32, width: f32, jag: f32) -> f32 {
  let o = uv - origin;
  let s = sin(angle);
  let c = cos(angle);
  let r = vec2<f32>(o.x * c - o.y * s, o.x * s + o.y * c);
  let j = noise(r * jag) * 0.02;
  return smoothstep(width, width * 0.5, abs(r.y + j));
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0,-1.0), vec2<f32>(1.0,-1.0), vec2<f32>(-1.0,1.0),
    vec2<f32>(-1.0,1.0), vec2<f32>(1.0,-1.0), vec2<f32>(1.0,1.0)
  );
  return vec4<f32>(pos[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = fragCoord.xy / vec2<f32>(u.u_width, u.u_height);
  var col = vec3<f32>(1.0);
  var a = 1.0;
  let atk = smoothstep(0.0, 1.0, u.u_attack);

  var claw = 0.0;
  claw += tear(uv, vec2<f32>(0.4,0.3), 1.0, 0.015, 50.0);
  claw += tear(uv, vec2<f32>(0.5,0.5), 0.9, 0.015, 60.0);
  claw += tear(uv, vec2<f32>(0.6,0.7), 0.8, 0.015, 70.0);

  let visible = smoothstep(0.1, 0.4, atk);
  col = mix(col, mix(vec3<f32>(0.6,0.0,0.0), vec3<f32>(0.1,0.02,0.01), atk), claw * visible);

  let collapse = smoothstep(0.4, 1.0, atk);
  let crumble = clamp(claw * collapse * 5.0, 0.0, 1.0);
  a *= 1.0 - crumble;
  if(a < 0.01) { discard; }

  return vec4<f32>(col, a);
}
        `,
      });

      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: shaderModule, entryPoint: "vs" },
        fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });

      const uniformBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });

      let start = 0;

      function render(ts: number) {
        if (!mounted) return;
        if (!start) start = ts;
        const t = (ts - start) / 1000;

        if (attackRef.current && uAttackRef.current < 1) {
          uAttackRef.current = Math.min(uAttackRef.current + 0.02, 1);
        }

        device.queue.writeBuffer(
          uniformBuffer,
          0,
          new Float32Array([t, uAttackRef.current, canvas.width, canvas.height]),
        );

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, uniformBindGroup);
        pass.draw(6);
        pass.end();
        device.queue.submit([encoder.finish()]);

        if (uAttackRef.current < 1) {
          requestAnimationFrame(render);
        } else {
          onClose();
        }
      }

      requestAnimationFrame(render);
    })();

    return () => {
      mounted = false;
      window.removeEventListener("resize", resize);
    };
  }, [onClose]);

  const handleClick = () => {
    attackRef.current = true;
  };

  return (
    <div className="fixed inset-0 z-50" style={{ background: "#111" }}>
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none p-4">
        <div className="pointer-events-auto bg-black/60 text-white rounded p-4 text-sm max-w-md text-center">
          <h2 className="text-lg font-bold mb-2">利用規約</h2>
          <p>本サービスを利用することでチャット内容がブラウザに保存されます。公序良俗に反する行為は禁止です。</p>
        </div>
      </div>
      <button
        className="absolute top-5 right-5 z-20 px-4 py-2 bg-white/90"
        onClick={handleClick}
      >
        斬撃！
      </button>
    </div>
  );
}
