/** How content.ts (isolated world) and bridge.ts (x.com's world) talk. */

/** On <html>: "on" while cleaning is enabled, "off" otherwise. Missing until settings load. */
export const CLEAN_ATTR = "data-clean-x-share";

/** Fired on window by the bridge after it cleaned a writeText() call; `detail` is the text X asked to copy. */
export const CLEANED_EVENT = "clean-x-share:cleaned";
