const colors = {
    reset: "\x1b[0m",
    underline: "\x1b[4m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    crimson: "\x1b[38m"
  };
  
  const logSymbols = {
    info: colors.blue + "i" + colors.reset,
    success: colors.green + "√" + colors.reset,
    warning: colors.yellow + "‼" + colors.reset,
    error: colors.red + "×" + colors.reset
  };

  module.exports = {
      logSymbols
  }