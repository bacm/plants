// Swipe between a plant's photos in the lightbox (ticket 087): one
// full-width zoomable page per photo. `index` is the photo shown; a swipe
// reports the new one through `onIndexChange`, and a change of `index` from
// the parent (the photo re-sorted after its date was edited) scrolls to it.
// Paging stops while the photo is zoomed, so a drag pans it instead.
import { useEffect, useRef, useState } from 'react';
import { FlatList, View, StyleSheet, useWindowDimensions } from 'react-native';
import { ZoomableImage } from './ZoomableImage';

export function PhotoPager({ photos, index, onIndexChange }) {
  const { width } = useWindowDimensions();
  const listRef = useRef(null);
  const shownIndex = useRef(index);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (index !== shownIndex.current && index >= 0) {
      shownIndex.current = index;
      listRef.current?.scrollToIndex({ index, animated: false });
    }
  }, [index]);

  const onScroll = (e) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== shownIndex.current && next >= 0 && next < photos.length) {
      shownIndex.current = next;
      onIndexChange(next);
    }
  };

  return (
    <FlatList
      ref={listRef}
      data={photos}
      keyExtractor={(photo) => photo.id}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      scrollEnabled={!zoomed}
      initialScrollIndex={Math.max(0, index)}
      getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      onScroll={onScroll}
      scrollEventThrottle={16}
      renderItem={({ item, index: i }) => (
        <View style={[styles.page, { width }]}>
          <ZoomableImage
            uri={item.uri}
            accessibilityLabel={`Photo ${i + 1} sur ${photos.length}`}
            onZoomChange={setZoomed}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  page: { height: '100%' },
});
