export interface WebhookResponse {
  success: boolean;
  message?: string;
  error?: string;
  bounty?: {
    id: string;
    contractAddress: string;
    amount: number;
  };
}
