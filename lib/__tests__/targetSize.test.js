const { targetSize } = require('../targetSize');

describe('targetSize', () => {
  it('leaves an image already under the limit unchanged', () => {
    expect(targetSize(1000, 800, 2048)).toEqual({ width: 1000, height: 800 });
  });

  it('leaves an image exactly at the limit unchanged', () => {
    expect(targetSize(2048, 1000, 2048)).toEqual({ width: 2048, height: 1000 });
  });

  it('downscales a landscape image so the long side (width) hits the limit', () => {
    expect(targetSize(4096, 2048, 2048)).toEqual({ width: 2048, height: 1024 });
  });

  it('downscales a portrait image so the long side (height) hits the limit', () => {
    expect(targetSize(2048, 4096, 2048)).toEqual({ width: 1024, height: 2048 });
  });

  it('rounds fractional results to the nearest pixel', () => {
    expect(targetSize(3000, 2000, 2048)).toEqual({ width: 2048, height: 1365 });
  });

  it('never upscales, even when maxLongSide is larger', () => {
    expect(targetSize(100, 50, 2048)).toEqual({ width: 100, height: 50 });
  });

  it('passes through invalid dimensions unchanged rather than throwing', () => {
    expect(targetSize(0, 0, 2048)).toEqual({ width: 0, height: 0 });
    expect(targetSize(NaN, 100, 2048)).toEqual({ width: NaN, height: 100 });
  });
});
