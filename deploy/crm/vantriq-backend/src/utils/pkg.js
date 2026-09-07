/**
 * A client's effective package terms. Standard tiers are locked to the
 * business model, so the product row is used verbatim. Enterprise+ is the
 * only customisable tier, and there the client's custom_* overrides win
 * wherever they are set.
 */
function effectivePackage(client, product) {
  if (!product) return null;
  const customisable = product.is_standard === false;
  const pick = (customVal, base) =>
    customisable && customVal !== null && customVal !== undefined && customVal !== '' ? customVal : base;

  return {
    id: product.id,
    name: product.name,
    target_tier: product.target_tier,
    is_standard: product.is_standard !== false,
    setup_fee: +pick(client.custom_setup_fee, product.setup_fee),
    retainer: +pick(client.custom_retainer, product.retainer),
    quota: +pick(client.custom_quota, product.quota),
    overage_rate: +pick(client.custom_overage_rate, product.overage_rate),
    msgs_per_session: +pick(client.custom_msgs_per_session, product.msgs_per_session),
    automation: pick(client.custom_automation, product.automation),
    data_layer: pick(client.custom_data_layer, product.data_layer),
    ai_model: pick(client.custom_ai_model, product.ai_model),
    channels: pick(client.custom_channels, product.channels),
    is_customised: customisable && [
      client.custom_setup_fee, client.custom_retainer, client.custom_quota,
      client.custom_overage_rate, client.custom_msgs_per_session,
      client.custom_automation, client.custom_data_layer,
      client.custom_ai_model, client.custom_channels,
    ].some((v) => v !== null && v !== undefined && v !== ''),
  };
}

module.exports = { effectivePackage };
