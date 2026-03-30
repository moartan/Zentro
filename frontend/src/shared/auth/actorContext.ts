const actorContext = {
  businessId: (import.meta.env.VITE_BUSINESS_ID as string | undefined) ?? null,
};

export function setActorBusinessId(businessId: string | null) {
  actorContext.businessId = businessId;
}

export function getActorHeaders() {
  if (!actorContext.businessId) {
    return undefined;
  }

  return {
    'X-Business-Id': actorContext.businessId,
  };
}
