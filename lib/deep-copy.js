const deepCopy = (originalObject) => {
  if (typeof originalObject !== "object") return originalObject;
  return JSON.parse(JSON.stringify(originalObject));
};

module.exports = deepCopy;
