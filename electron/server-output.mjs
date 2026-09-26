export function forwardServerOutput(source, destination) {
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    source.off('data', forward);
    destination.off('error', handleDestinationError);
  };

  const handleDestinationError = (error) => {
    if (error?.code === 'EPIPE') {
      stop();
      return;
    }

    stop();
    throw error;
  };

  const forward = (chunk) => {
    try {
      destination.write(`[vinext] ${chunk}`);
    } catch (error) {
      if (error?.code === 'EPIPE') {
        stop();
        return;
      }

      stop();
      throw error;
    }
  };

  source.on('data', forward);
  destination.on('error', handleDestinationError);
}
