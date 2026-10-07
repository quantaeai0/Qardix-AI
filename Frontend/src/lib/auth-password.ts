// The login system requires >= 6 char passwords. Users type short PINs (e.g. 2798);
// we deterministically extend them before sending to auth.
export function toInternalPassword(pin: string) {
  return `Qx#${pin}#ardix`;
}
