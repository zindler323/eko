export interface EkoLlmConfig {
    apiUrl?: string;
    modelName?: string;
    apiKey?: string;
}

export type EkoConfig = EkoLlmConfig | string;

export interface EkoInvokeParam {
    tools: Array<string>
}
