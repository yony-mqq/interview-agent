declare module '@alicloud/pop-core' {
  export interface RPCClientConfig {
    accessKeyId: string;
    accessKeySecret: string;
    endpoint: string;
    apiVersion: string;
  }

  export class RPCClient {
    constructor(config: RPCClientConfig);
    request(action: string, params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<any>;
  }
}
