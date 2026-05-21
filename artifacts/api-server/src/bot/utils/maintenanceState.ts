let _maintenance = false;

export function getMaintenance(): boolean {
  return _maintenance;
}

export function setMaintenance(val: boolean): void {
  _maintenance = val;
}
