export type TSupportedRuntime = 'cfworker' | 'node';

export default class Environment {
  private constructor(
    public readonly runtime: TSupportedRuntime,
    private env: IRuntimeEnv,
  ) {}

  static #instance: Environment | null;

  get KV() {
    return this.env.KV_PROD;
  }

  get HOST() {
    return this.env.HOST;
  }

  get OPENAI_API_KEY() {
    return this.env.OPENAI_API_KEY;
  }

  private _timeout: number | null = null;

  get timeout() {
    return this._timeout ?? 1000;
  }

  static instance() {
    if (!this.#instance) {
      throw new Error('Environment not initialized');
    }
    return this.#instance;
  }

  static from(runtime: TSupportedRuntime, env: IRuntimeEnv) {
    if (this.#instance) {
      return this.#instance;
    }
    const instance = new Environment(runtime, env);

    if (env.TIMEOUT) {
      if (runtime === 'cfworker') {
        // cloudflare worker 会在 30s 后强制结束 worker，所以这里设置 29s 的超时
        instance._timeout = 29 * 1000;
      }
      const timeout = parseInt(env.TIMEOUT, 10);
      if (!isNaN(timeout)) {
        instance._timeout = timeout;
      }
    }

    this.#instance = instance;
    return instance;
  }

  static dispose() {
    this.#instance = null;
  }
}
