import { useTheme } from '../theme/ThemeContext';
import { TEXT_SCALES, stepTextScale } from '../theme/textScale';
import { useCommand } from './MenuCommands';

/**
 * View › Bigger Text, Smaller Text and Actual Size, in the Mac and Windows apps.
 *
 * Mounted only there: a browser keeps ⌘= and ⌘- for its own zoom, and a phone
 * follows the system text size. Each step is dimmed at the end of the range it
 * would move past.
 */
export default function TextSizeCommands() {
  const { textScale, setTextScale } = useTheme();
  useCommand('textBigger', () => setTextScale(stepTextScale(textScale, 1)), textScale < TEXT_SCALES[TEXT_SCALES.length - 1]);
  useCommand('textSmaller', () => setTextScale(stepTextScale(textScale, -1)), textScale > TEXT_SCALES[0]);
  useCommand('textActualSize', () => setTextScale(1), textScale !== 1);
  return null;
}
