import { pickCoverPhoto } from '../coverPhoto';

const photos = [
  { id: 'new', uri: 'n' },
  { id: 'old', uri: 'o' },
];

describe('pickCoverPhoto', () => {
  it('returns the chosen photo when present', () => {
    expect(pickCoverPhoto(photos, 'old').id).toBe('old');
  });
  it('falls back to the newest when the chosen one is missing', () => {
    expect(pickCoverPhoto(photos, 'gone').id).toBe('new');
  });
  it('falls back to the newest when no id', () => {
    expect(pickCoverPhoto(photos, null).id).toBe('new');
  });
  it('returns null for no photos', () => {
    expect(pickCoverPhoto([], 'x')).toBeNull();
  });
});
