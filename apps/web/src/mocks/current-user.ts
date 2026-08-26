export interface CurrentUser {
  firstName: string;
  fullName: string;
  companyName: string;
}

export const currentUser: CurrentUser = {
  firstName: "João",
  fullName: "João Oliveira",
  companyName: "JO Construções",
};
