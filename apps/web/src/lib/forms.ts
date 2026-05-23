export function getFormString(form: FormData, key: string) {
  return String(form.get(key) ?? '')
}
