export {};

declare global {
  interface Navigator {
    gpu?: GPU;
  }

  interface GPU {
    requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
    getPreferredCanvasFormat(): GPUTextureFormat;
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

  interface GPUQueue {
    writeBuffer(buffer: GPUBuffer, offset: number, data: BufferSource): void;
    submit(commands: GPUCommandBuffer[]): void;
  }

  interface GPUCommandEncoder {
    beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
    finish(): GPUCommandBuffer;
  }

  interface GPURenderPassEncoder {
    setPipeline(pipeline: GPURenderPipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    draw(vertexCount: number): void;
    end(): void;
  }

  interface GPURenderPipeline {
    getBindGroupLayout(index: number): GPUBindGroupLayout;
  }

  interface GPUBindGroupLayout {}

  interface GPUCanvasContext {
    configure(config: GPUCanvasConfiguration): void;
    getCurrentTexture(): GPUTexture;
  }

  interface GPUTexture {
    createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  }

  interface GPUTextureView {}

  interface GPUShaderModule {}

  interface GPUBuffer {}

  interface GPUBindGroup {}

  interface GPUCommandBuffer {}

  interface GPUCanvasConfiguration {
    device: GPUDevice;
    format: GPUTextureFormat;
    alphaMode?: 'opaque' | 'premultiplied';
  }

  interface GPURenderPipelineDescriptor {
    layout?: GPUPipelineLayout | 'auto';
    vertex: GPUVertexState;
    fragment?: GPUFragmentState;
    primitive?: GPUPrimitiveState;
  }

  interface GPUPipelineLayout {}

  interface GPUVertexState {
    module: GPUShaderModule;
    entryPoint: string;
  }

  interface GPUFragmentState {
    module: GPUShaderModule;
    entryPoint: string;
    targets: GPUColorTargetState[];
  }

  interface GPUColorTargetState {
    format: GPUTextureFormat;
  }

  interface GPUPrimitiveState {
    topology: GPUPrimitiveTopology;
  }

  type GPUPrimitiveTopology = 'triangle-list' | 'triangle-strip';

  interface GPUBindGroupDescriptor {
    layout: GPUBindGroupLayout;
    entries: GPUBindGroupEntry[];
  }

  interface GPUBindGroupEntry {
    binding: number;
    resource: GPUBindingResource;
  }

  interface GPUBindingResource {
    buffer: GPUBuffer;
  }

  interface GPUBufferDescriptor {
    size: number;
    usage: number;
  }

  interface GPUShaderModuleDescriptor {
    code: string;
  }

  interface GPUCommandEncoderDescriptor {}

  interface GPUDeviceDescriptor {}

  interface GPURequestAdapterOptions {}

  interface GPURenderPassDescriptor {
    colorAttachments: GPURenderPassColorAttachment[];
  }

  interface GPURenderPassColorAttachment {
    view: GPUTextureView;
    clearValue?: GPUColor;
    loadOp: 'clear' | 'load';
    storeOp: 'store' | 'discard';
  }

  interface GPUColor {
    r: number;
    g: number;
    b: number;
    a: number;
  }

  type GPUTextureFormat = string;

  interface GPUTextureViewDescriptor {}

  const GPUBufferUsage: {
    UNIFORM: number;
    COPY_DST: number;
  };

  interface HTMLCanvasElement {
    getContext(contextId: 'webgpu'): GPUCanvasContext | null;
  }
}
