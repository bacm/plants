/**
 * lib/dialogs.js is the one place allowed to import Alert (ticket 042); this
 * test pins down its web and native branches directly, mocking both
 * react-native (Platform.OS switchable, Alert.alert a spy) and the browser
 * window.alert/confirm globals.
 */
const mockPlatform = { OS: 'ios' };
const mockAlert = jest.fn();

jest.mock('react-native', () => ({
  Platform: mockPlatform,
  Alert: { alert: (...args) => mockAlert(...args) },
}));

const { showMessage, confirm, choose } = require('../dialogs');

function pressButton(buttons, text) {
  const btn = buttons.find((b) => b.text === text);
  btn.onPress();
}

function dismiss(options) {
  options.onDismiss();
}

beforeEach(() => {
  mockAlert.mockClear();
  mockPlatform.OS = 'ios';
  global.window = global.window || {};
  window.alert = jest.fn();
  window.confirm = jest.fn();
});

describe('showMessage', () => {
  it('calls window.alert with title and message on web', () => {
    mockPlatform.OS = 'web';
    showMessage('Titre', 'Un message');
    expect(window.alert).toHaveBeenCalledWith('Titre\n\nUn message');
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('falls back to the title alone on web when there is no message', () => {
    mockPlatform.OS = 'web';
    showMessage('Titre seul');
    expect(window.alert).toHaveBeenCalledWith('Titre seul');
  });

  it('calls Alert.alert on native', () => {
    mockPlatform.OS = 'ios';
    showMessage('Titre', 'Un message');
    expect(mockAlert).toHaveBeenCalledWith('Titre', 'Un message');
    expect(window.alert).not.toHaveBeenCalled();
  });
});

describe('confirm', () => {
  it('resolves window.confirm result on web', async () => {
    mockPlatform.OS = 'web';
    window.confirm.mockReturnValue(true);
    await expect(confirm({ title: 'Supprimer', message: 'Sûr ?' })).resolves.toBe(true);
    expect(window.confirm).toHaveBeenCalledWith('Supprimer\n\nSûr ?');
  });

  it('resolves false when window.confirm is declined on web', async () => {
    mockPlatform.OS = 'web';
    window.confirm.mockReturnValue(false);
    await expect(confirm({ title: 'Supprimer' })).resolves.toBe(false);
  });

  it('resolves true when the confirm button is pressed on native', async () => {
    mockPlatform.OS = 'ios';
    const promise = confirm({ title: 'Supprimer', message: 'Sûr ?', confirmLabel: 'Supprimer' });
    const [, , buttons] = mockAlert.mock.calls[0];
    pressButton(buttons, 'Supprimer');
    await expect(promise).resolves.toBe(true);
  });

  it('resolves false when cancel is pressed on native', async () => {
    mockPlatform.OS = 'ios';
    const promise = confirm({ title: 'Supprimer' });
    const [, , buttons] = mockAlert.mock.calls[0];
    pressButton(buttons, 'Annuler');
    await expect(promise).resolves.toBe(false);
  });

  it('resolves false when the dialog is dismissed on native', async () => {
    mockPlatform.OS = 'android';
    const promise = confirm({ title: 'Supprimer' });
    const [, , , options] = mockAlert.mock.calls[0];
    dismiss(options);
    await expect(promise).resolves.toBe(false);
  });

  it('marks the confirm button destructive when asked, on native', () => {
    mockPlatform.OS = 'ios';
    confirm({ title: 'Supprimer', confirmLabel: 'Supprimer', destructive: true });
    const [, , buttons] = mockAlert.mock.calls[0];
    expect(buttons.find((b) => b.text === 'Supprimer').style).toBe('destructive');
  });
});

describe('choose', () => {
  const options = [
    { key: 'camera', label: 'Prendre une photo' },
    { key: 'gallery', label: 'Galerie' },
  ];

  it('resolves webKey immediately on web, with no dialog', async () => {
    mockPlatform.OS = 'web';
    await expect(choose({ title: 'Ajouter une photo', options, webKey: 'gallery' })).resolves.toBe(
      'gallery'
    );
    expect(window.alert).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('throws on web when webKey is missing', () => {
    mockPlatform.OS = 'web';
    expect(() => choose({ title: 'Ajouter une photo', options })).toThrow(/webKey/);
  });

  it('resolves the pressed option key on native', async () => {
    mockPlatform.OS = 'ios';
    const promise = choose({ title: 'Ajouter une photo', options });
    const [, , buttons] = mockAlert.mock.calls[0];
    pressButton(buttons, 'Galerie');
    await expect(promise).resolves.toBe('gallery');
  });

  it('resolves null when cancel is pressed on native', async () => {
    mockPlatform.OS = 'ios';
    const promise = choose({ title: 'Ajouter une photo', options });
    const [, , buttons] = mockAlert.mock.calls[0];
    pressButton(buttons, 'Annuler');
    await expect(promise).resolves.toBeNull();
  });

  it('resolves null when the dialog is dismissed on native', async () => {
    mockPlatform.OS = 'android';
    const promise = choose({ title: 'Ajouter une photo', options });
    const [, , , dismissOptions] = mockAlert.mock.calls[0];
    dismiss(dismissOptions);
    await expect(promise).resolves.toBeNull();
  });
});
