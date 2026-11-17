export declare const DEFAULT_PORT: number
export declare function devPort(
	root: string,
	env?: Record<string, string | undefined>,
): number
export declare function portHolders(port: number): string[]
export declare function assertPortFree(port: number): Promise<void>
