function normalizeValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = normalizeValue(value[key]);
        return result;
      }, {});
  }

  return value;
}

export function formChanged(initialValue, currentValue) {
  return (
    JSON.stringify(normalizeValue(initialValue)) !==
    JSON.stringify(normalizeValue(currentValue))
  );
}
