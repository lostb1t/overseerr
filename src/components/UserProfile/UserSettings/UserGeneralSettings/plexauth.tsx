import PlexLoginButton from '@app/components/PlexLoginButton';
// import useSettings from '@app/hooks/useSettings';
import { useUser } from '@app/hooks/useUser';
import axios from 'axios';
// import { useRouter } from 'next/dist/client/router';
import { useEffect, useState } from 'react';

// const messages = defineMessages({
//   signin: 'Sign In',
//   signinheader: 'Sign in to continue',
//   signinwithplex: 'Use your Plex account',
//   signinwithoverseerr: 'Use your {applicationTitle} account',
// });

const Auth = () => {
  // const intl = useIntl();
  const [error, setError] = useState('');
  const [isProcessing, setProcessing] = useState(false);
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);
  const { user, revalidate } = useUser();
  // const router = useRouter();
  // const settings = useSettings();

  // Effect that is triggered when the `authToken` comes back from the Plex OAuth
  // We take the token and attempt to sign in. If we get a success message, we will
  // ask swr to revalidate the user which _should_ come back with a valid user.
  useEffect(() => {
    const login = async () => {
      setProcessing(true);
      try {
        const response = await axios.post(
          `/api/v1/user/${user?.id}/settings/plex`,
          {
            authToken: authToken,
          }
        );

        if (response.data?.id) {
          revalidate();
        }
      } catch (e) {
        setError(e.response.data.message);
        setAuthToken(undefined);
        setProcessing(false);
      }
    };
    if (authToken) {
      login();
    }
  }, [authToken, revalidate]);

  // Effect that is triggered whenever `useUser`'s user changes. If we get a new
  // valid user, we redirect the user to the home page as the login was successful.
  // useEffect(() => {
  //   if (user) {
  //     router.push('/');
  //   }
  // }, [user, router]);

  // const { data: backdrops } = useSWR<string[]>('/api/v1/backdrops', {
  //   refreshInterval: 0,
  //   refreshWhenHidden: false,
  //   revalidateOnFocus: false,
  // });

  return (
    <div>
      <h3 className="text-sm font-medium text-red-300">{error}</h3>
      <PlexLoginButton
        isProcessing={isProcessing}
        onAuthToken={(authToken) => setAuthToken(authToken)}
      />
    </div>
  );
};

export default Auth;
