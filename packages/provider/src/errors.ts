export class ProviderError extends Error {
  readonly providerId: string;
  readonly statusCode: number;
  readonly errorCode?: string;

  constructor(
    message: string,
    providerId: string,
    statusCode: number,
    errorCode?: string,
  ) {
    super(message);
    this.name = "ProviderError";
    this.providerId = providerId;
    this.statusCode = statusCode;
    if (errorCode !== undefined) {
      this.errorCode = errorCode;
    }
  }

  static fromResponse(
    providerId: string,
    statusCode: number,
    body: unknown,
  ): ProviderError {
    const data = body as Record<string, unknown> | null;
    const errorCode = data?.error_code as string | undefined;
    const message =
      (data?.error as Record<string, unknown> | undefined)?.message ??
      (data?.message as string | undefined) ??
      `Provider ${providerId} returned status ${statusCode}`;

    return new ProviderError(
      typeof message === "string" ? message : String(message),
      providerId,
      statusCode,
      errorCode,
    );
  }
}
