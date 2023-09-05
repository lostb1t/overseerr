import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import PlexOAuth from '@app/utils/plex';
import { ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  signinwithplex: 'Sign In',
  signingin: 'Signing In…',
  isAuthenticated: 'You are authenticated with plex',
});

const plexOAuth = new PlexOAuth();

interface PlexLoginButtonProps {
  onAuthToken: (authToken: string) => void;
  isProcessing?: boolean;
  onError?: (message: string) => void;
}

const PlexLoginButton = ({
  onAuthToken,
  onError,
  isProcessing,
}: PlexLoginButtonProps) => {
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const { user, revalidate } = useUser();

  useEffect(() => {
    setAuthenticated(false);
    if (user?.plexUsername && user?.plexUsername !== '') {
      setAuthenticated(true);
    }
  }, [revalidate, user?.plexUsername]);

  const getPlexLogin = async () => {
    setLoading(true);
    try {
      const authToken = await plexOAuth.login();
      setLoading(false);
      onAuthToken(authToken);
    } catch (e) {
      if (onError) {
        onError(e.message);
      }
      setLoading(false);
    }
  };
  return (
    <span className="block w-full rounded-md shadow-sm">
      <button
        type="button"
        onClick={() => {
          plexOAuth.preparePopup();
          setTimeout(() => getPlexLogin(), 1500);
        }}
        disabled={loading || isProcessing || authenticated}
        className="plex-button"
      >
        <ArrowLeftOnRectangleIcon />
        <span>
          {loading
            ? intl.formatMessage(globalMessages.loading)
            : isProcessing
            ? intl.formatMessage(messages.signingin)
            : authenticated
            ? intl.formatMessage(messages.isAuthenticated)
            : intl.formatMessage(messages.signinwithplex)}
        </span>
      </button>
    </span>
  );
};

export default PlexLoginButton;
