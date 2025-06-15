export {};

declare global {
  interface Navigator {
    gpu?: GPU;
  }

  interface GPU {}
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
  interface GPURenderPipeline {}
  interface GPUBindGroup {}
  const GPUBufferUsage: {
    UNIFORM: number;
    COPY_DST: number;
  };
}

