const PERPLEXITY_API_KEY_NAMES = ['PUBFIN_API_KEY', 'PERPLEXITY_API_KEY', 'PPLX_API_KEY'] as const;
const PERPLEXITY_MODEL_NAMES = ['PUBFIN_MODEL', 'PERPLEXITY_MODEL', 'PPLX_MODEL'] as const;

function firstConfiguredValue(names: readonly string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return '';
}

export function getPerplexityApiKey() {
  return firstConfiguredValue(PERPLEXITY_API_KEY_NAMES);
}

export function getPerplexityModel(defaultModel = 'sonar-pro') {
  return firstConfiguredValue(PERPLEXITY_MODEL_NAMES) || defaultModel;
}

export function perplexityApiKeyErrorMessage() {
  return [
    `Perplexity API key is not configured. Add one of ${PERPLEXITY_API_KEY_NAMES.join(', ')} in Vercel Project Settings > Environment Variables.`,
    'Make sure it is enabled for the environment you are using, usually Production for the live URL or Preview for branch deployments, then redeploy.',
  ].join(' ');
}
