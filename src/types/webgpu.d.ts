export {};

declare global {
  interface Navigator {
    gpu?: GPU;
  }

  type GPUTextureFormat = string;
  interface GPU {
    requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
    getPreferredCanvasFormat(): GPUTextureFormat;
  }
  interface GPURequestAdapterOptions {
    powerPreference?: string;
    forceFallbackAdapter?: boolean;
  }
  interface GPUAdapter {
    requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  }
  interface GPUDevice {
    createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
    createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
    createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
    createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
    createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
    queue: GPUQueue;
  }
  interface GPUCanvasContext {
    configure(config: GPUCanvasConfiguration): void;
    getCurrentTexture(): GPUTexture;
  }
  interface GPUBuffer {}
  interface GPURenderPipeline {
    getBindGroupLayout(index: number): GPUBindGroupLayout;
  }
  interface GPUBindGroup {}
  interface GPUBindGroupLayout {}
  interface GPUShaderModule {}
  interface GPUQueue {
    submit(commands: GPUCommandBuffer[]): void;
    writeBuffer(buffer: GPUBuffer, offset: number, data: BufferSource): void;
  }
  interface GPUCommandEncoder {
    beginRenderPass(desc: GPURenderPassDescriptor): GPURenderPassEncoder;
    finish(): GPUCommandBuffer;
  }
  interface GPUCommandBuffer {}
  interface GPURenderPassEncoder {
    setPipeline(pipeline: GPURenderPipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    draw(vertexCount: number): void;
    end(): void;
  }
  interface GPUTexture {
    createView(): GPUTextureView;
  }
  interface GPUTextureView {}
  interface GPURenderPassColorAttachment {
    view: GPUTextureView;
    clearValue: { r: number; g: number; b: number; a: number };
    loadOp: string;
    storeOp: string;
  }
  interface GPURenderPassDescriptor {
    colorAttachments: GPURenderPassColorAttachment[];
  }
  const GPUBufferUsage: {
    UNIFORM: number;
    COPY_DST: number;
  };

  interface HTMLCanvasElement {
    getContext(contextId: "webgpu", options?: any): GPUCanvasContext | null;
  }
}

