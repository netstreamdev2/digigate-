import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  Keyboard,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ScrollViewProps,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';

/*
 * Keeps whatever the guard is typing in, and the button they press next, above the keyboard.
 *
 * Android draws the app edge to edge, so the keyboard slides over the screen instead of shrinking it, and anything low
 * on a screen ends up underneath it. A screen with fields lifts itself by the keyboard's height (useKeyboardHeight),
 * and its KeyboardScroll scrolls the field being typed in into view. A field takes part by being a KeyboardInput.
 */

/** Room left under a field once it's scrolled into view: enough for a button that follows it. */
const ROOM_BELOW_FIELD = 80;

/** How tall the keyboard is while it's up, and 0 while it's down. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => setHeight(event.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}

const RevealContext = createContext<() => void>(() => undefined);

type Props = ScrollViewProps & {
  /** How much of the bottom of the scroll view a footer pinned over it hides, so a field is never left under it. */
  coveredBelow?: number;
  children: ReactNode;
};

export function KeyboardScroll({ coveredBelow = 0, children, onScroll, ...rest }: Props) {
  const scroll = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const keyboardHeight = useKeyboardHeight();

  const reveal = useCallback(() => {
    // Two frames on, so the screen has finished lifting above the keyboard before anything is measured.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const input = TextInput.State.currentlyFocusedInput();
        const view = scroll.current;
        if (!input || !view) return;
        view.measureInWindow((_viewX, viewY, _viewWidth, viewHeight) => {
          input.measureInWindow((_x, y, _width, height) => {
            const hiddenBy = y + height + ROOM_BELOW_FIELD - (viewY + viewHeight - coveredBelow);
            if (hiddenBy > 0) scroll.current?.scrollTo({ y: offset.current + hiddenBy, animated: true });
          });
        });
      }),
    );
  }, [coveredBelow]);

  // The keyboard has just come up over a field that was already focused.
  useEffect(() => {
    if (keyboardHeight > 0) reveal();
  }, [keyboardHeight, reveal]);

  const track = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };

  return (
    <RevealContext.Provider value={reveal}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} {...rest} onScroll={track}>
        {children}
      </ScrollView>
    </RevealContext.Provider>
  );
}

/** A TextInput that, inside a KeyboardScroll, scrolls itself above the keyboard when the guard taps into it. */
export function KeyboardInput({ onFocus, ref, ...props }: TextInputProps & { ref?: Ref<TextInputInstance> }) {
  const reveal = useContext(RevealContext);
  const focus = useMemo<TextInputProps['onFocus']>(
    () => (event) => {
      reveal();
      onFocus?.(event);
    },
    [onFocus, reveal],
  );
  return <TextInput ref={ref} {...props} onFocus={focus} />;
}
