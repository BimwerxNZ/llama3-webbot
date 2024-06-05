import { SecretsManager } from 'aws-sdk';

const secretsManager = new SecretsManager();

export async function getSecretValue(secretName: string): Promise<Record<string, any>> {
  try {
    const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
    if (data.SecretString) {
      return JSON.parse(data.SecretString);
    }
    throw new Error('SecretString is undefined');
  } catch (err) {
    console.error('Error fetching secret:', err);
    throw err;
  }
}
