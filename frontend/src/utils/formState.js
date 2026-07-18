export function formSnapshot(value) {
  return JSON.stringify(value ?? null, (_key, item) => (item === undefined ? null : item));
}

export function formChanged(initialValue, currentValue) {
  return formSnapshot(initialValue) !== formSnapshot(currentValue);
}
