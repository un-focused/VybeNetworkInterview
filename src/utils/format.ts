/**
 * splits a camel case string into its constituent parts
 * @param str: str that is to be broken up
 */
export function splitCamelCaseString(str: string): string[] {
    // use a regular expression to match the camel case pattern
    const regex = /([a-z])([A-Z])/g;

    // replace the pattern with a space and the matched characters
    const result = str.replace(regex, '$1 $2');

    // split the string into an array of words
    return result.split(' ');
}

export function uppercaseWords(words: string[]) {
    // use the map method to uppercase the first letter of each word
    return words.map(word => word.charAt(0).toUpperCase() + word.slice(1));
}