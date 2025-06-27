// Mock electron
const electron = {
  invoke: jest.fn(),
};

// Mock window.electron
global.window = {
  ...global.window,
  electron,
};

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
}); 