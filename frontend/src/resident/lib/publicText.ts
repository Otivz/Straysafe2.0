import { EMAIL_PATTERN, EXACT_ADDRESS_PATTERN, PHONE_PATTERN } from '../../preview/lib/format';

/**
 * Text that neighbours will read (a lost-pet notice, a found-animal notice, a sighting, the place name on them) must not
 * carry anyone's contact details or exact address. The Admin notice editor applies the same patterns before it publishes.
 *
 * Returns a plain-language reason when the text breaks the rule, or null when it is fine. This is a courtesy in the form;
 * the real guarantee has to come from the server, which must validate public text itself.
 */
export function publicTextProblem(text: string): string | null {
  if (PHONE_PATTERN.test(text)) return 'Please remove phone numbers. Neighbours reach you through the subdivision.';
  if (EMAIL_PATTERN.test(text)) return 'Please remove email addresses. Neighbours reach you through the subdivision.';
  if (EXACT_ADDRESS_PATTERN.test(text)) return 'Please remove house or lot numbers. Describe the general area instead, such as “near the clubhouse”.';
  return null;
}
