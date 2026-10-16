// phone keypad letters, for vanity numbers such as 780-464-RIDE
const KEYPAD = { abc: "2", def: "3", ghi: "4", jkl: "5", mno: "6", pqrs: "7", tuv: "8", wxyz: "9" };

/**
 * A tel: link for a phone number as written, letters dialled as their keypad digits.
 * @param {string} phone e.g. "780-464-RIDE"
 * @returns {string} e.g. "tel:7804647433"
 */
export const telHref = (phone) => {
  const digits = [...phone.toLowerCase()]
    .map((char) => (/\d/.test(char) ? char : Object.entries(KEYPAD).find(([letters]) => letters.includes(char))?.[1] ?? ""))
    .join("");
  return `tel:${phone.trim().startsWith("+") ? "+" : ""}${digits}`;
};
