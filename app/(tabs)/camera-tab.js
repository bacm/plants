// Dummy tab route: the tab bar's central camera button is intercepted by a
// tabPress listener in _layout.js and pushed to the real full-screen
// /capture route instead, but expo-router's file-based Tabs still needs a
// route file behind the tab (e.g. for a stray deep link or swipe gesture),
// so this one just redirects there too.
//
// Named "camera-tab", not "capture": a group segment like "(tabs)" is
// invisible in the URL, so a file at app/(tabs)/capture.js would resolve to
// the exact same "/capture" path as the real top-level app/capture.js —
// router.push('/capture') from _layout.js's tabPress listener then landed on
// this (blank) tab instead of the actual camera screen.
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function CaptureTabRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/capture');
  }, [router]);
  return null;
}
