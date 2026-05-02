type ClerkEmailAddress = {
  id: string;
  emailAddress: string;
};

type ClerkUserEmailShape = {
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmailAddress[];
};

export function getPrimaryEmailFromClerkUser(user: ClerkUserEmailShape) {
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  return primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "";
}
