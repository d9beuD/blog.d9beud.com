---
    title: Log your users in with Google OAuth, API Platform and Vue.js
    tags: symfony api-platform google oauth php api vue
    date: 2024-04-19 20:43:00 +02:00
---

I recently started a new project using **Symfony 7**, **API Platform** and **Vue.js 3**. I wanted to allow users to log in or register with their Google account. Here is how I did it.

First, like you probably did, I looked online for a bundle that would help me with that. I found [`knpuniversity/oauth2-client-bundle`](https://github.com/knpuniversity/oauth2-client-bundle) wich was promising. Reading in their `README.md`, I saw the following:

> Not sure which to use? If you need OAuth (social) authentication & registration, try [hwi/oauth-bundle](https://github.com/hwi/HWIOAuthBundle). If you don't like it, come back!

So what they say is that `HWIOAuthBundle` is exactly what I need? Yeah, but no. It's not that simple. I'll explain why and give you a solution.

## The idea

The idea is to use `HWIOAuthBundle` to authenticate users with Google. Once authenticated, we will generate a JWT token with [`lexik/jwt-authentication-bundle`](https://github.com/lexik/LexikJWTAuthenticationBundle) and send it back to the user. The user will then use this token to authenticate with our API.

It works great if the Symfony application is handling the frontend. But in our case, **we are using Vue.js**. The problem is that OAuth applications are not allowed to have multiple redirect URIs (it's the URI where the OAuth server respond with its access token). So we can't have one for the Symfony application and one for the Vue.js application.

Because the Oauth process is handled by the Symfony application, when the user triggers the login with Google from the Vue.js frontend, we need to open a new window to the backend. The backend will redirect to the Google SSO page, allowing the user to enter its credentials. Once the user is authenticated, Google redirect to the backend with an access token within query parameters the backend will send the JWT token back to the frontend.

## Setting up `HWIOAuthBundle`

First, let's install `HWIOAuthBundle` in our Symfony project:

```bash
composer require hwi/oauth-bundle
```

Thanks to the Symfony Flex recipe, the bundle is now installed and configured to work with Symfony. We need to configure our OAuth provider, Google in our case. Here is the configuration I used:

```yml
# config/packages/hwi_oauth.yaml
hwi_oauth:
  resource_owners:
    google:
      type:                google
      client_id:           '%env(GOOGLE_ID)%'
      client_secret:       '%env(GOOGLE_SECRET)%'
      scope:               "email profile"
```

Because I don't want to share my Google credentials in version control, I used environment variables. You can set them in your `.env` or `.env.local` file:

```sh
# .env.local
GOOGLE_ID='your_google_client_id'
GOOGLE_SECRET='your_google_client_secret'
```

Now, to make our user able to log in with Google, we need to set up a firewall in our `security.yaml`:

```yml
# config/packages/security.yaml
security:
  firewalls:
    main:
      pattern: ^/
      lazy: true
      provider: app_user_provider

      oauth: // [!code highlight:10]
        resource_owners:
          google: /login/check-google # This route must be defined in your routes.yaml
        login_path: /auth/login # This one too
        use_forward: false
        failure_path: hwi_oauth_connect_registration
        oauth_user_provider:
          service: hwi_oauth.user.provider.entity
```

Say the user successfully logs in with Google, `HWIOAuthBundle` needs a service that is able to load users based on the user response of the OAuth endpoint. As I am using Doctrine ORM to store my users, I configured the `hwi_oauth.user.provider.entity` service like this:

```yml
# config/services.yaml
services:
  # ... other services
  hwi_oauth.user.provider.entity:
    class: App\Security\EntityUserProvider
    arguments:
      $class: App\Entity\User
      $properties:
        'google': 'googleId'
```

It will only work if our `User` entity implements the `HWI\Bundle\OAuthBundle\Security\Core\User\OAuthUserProviderInterface`. Here is how I did it:

```php
// src/Entity/User.php
#[ORM\Entity(repositoryClass: UserRepository::class)]
class User implements UserInterface, PasswordAuthenticatedUserInterface // [!code --]
class User implements UserInterface, PasswordAuthenticatedUserInterface, OAuthAwareUserProviderInterface // [!code ++]
{
    // ...

    #[ORM\Column(length: 255, nullable: true)] // [!code ++:6]
    private ?string $googleId = null;

    #[Groups(['user:read'])]
    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $avatar = null;

    public function loadUserByOAuthUserResponse(UserResponseInterface $response): UserInterface { // [!code ++:9]
        $this->setEmail($response->getEmail());
        $this->setFirstname($response->getFirstName());
        $this->setLastname($response->getLastName());
        $this->setAvatar($response->getProfilePicture());
        $this->setGoogleId($response->getUserIdentifier());

        return $this;
    }
}
```

At this point, you should be able to log your users in with Google. Great! But we do not have a JWT token yet, and it is necessary for the frontend to authenticate with our API.

## Generating a JWT token

To generate a JWT token, we will use `lexik/jwt-authentication-bundle`. You can read the API Platform [JWT documentation](https://api-platform.com/docs/core/jwt/) or follow this guide which is simplified. Let's install it:

```bash
composer require lexik/jwt-authentication-bundle
```

JWT tokens are secure because they are signed with a secret key. We need to generate a key pair:

```bash
symfony console lexik:jwt:generate-keypair
```

Now, let's configure a new firewall in our `security.yaml` for the JWT token:

```yml
# config/packages/security.yaml
security:
  firewalls:
    api: // [!code ++:5]
      pattern: ^/api/
      stateless: true
      provider: app_user_provider
      jwt: ~
    main:
      # Same as before here
```

If you configured a `json_login` firewall, you can set the success and failure handlers to the following:

```yml
# config/packages/security.yaml
security:
  firewalls:
    api: # ...
    main:
      # ...
      json_login:
        # ...
        success_handler: lexik_jwt_authentication.handler.authentication_success // [!code ++:2]
        failure_handler: lexik_jwt_authentication.handler.authentication_failure
```

## Make `HWIOAuthBundle` return a JWT token

Based on the previous code example, my guess was that setting the `success_handler` in the `oauth` configuration would make `HWIOAuthBundle` return a JWT token. And it did! Here is the updated `security.yaml`:

```yml
# config/packages/security.yaml
security:
  firewalls:
    main:
      # ...
      oauth:
        # ...
        success_handler: lexik_jwt_authentication.handler.authentication_success // [!code ++:2]
        failure_handler: lexik_jwt_authentication.handler.authentication_failure
```

Now, when we go to `/connect/google` and log in with Google, we get a JWT token in the response. But we can't use it yet because we need to send it back to the frontend.

```
{ "token": "..." }
```

## Retrieve the JWT token from the backend

Our frontend is a Vue.js application hosted on a different domain than our Symfony application. We can't use cookies to store the JWT token because of the [SameSite cookie attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite). We will use the `localStorage` to store the JWT token.

Examples I'll show you are adapted for Vue.js 3 but it's easily adaptable to any JavaScript framework.

To handle authentication, I created an `auth` store based on [Pinia](https://pinia.vuejs.org):

```ts
// src/stores/auth.ts
import { defineStore } from 'pinia'
import { ref} from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const jwt = ref<string | null>(null)
  const currentUser = ref<User | null>(null)

  return { jwt, currentUser }
})
```

Now, we need to call the `/connect/google` endpoint from our Vue.js application in a new window:

```ts
export const useAuthStore = defineStore('auth', () => {
  // ...
  const loginWith = async (service: 'google') => { // [!code ++:3]
    window.open(`http://localhost/connect/${service}`)
  }

  return { jwt, currentUser } // [!code --]
  return { jwt, currentUser, loginWith } // [!code ++]
})
```

```vue
<script lang="ts" setup>
  import { useAuthStore } from '@/stores/auth'
  const authStore = useAuthStore()
</script>

<template>
  <button @click="authStore.loginWith('google')">Login with Google</button>
</template>
```

Now, when the user clicks the "Login with Google" button, a new window opens to the `/connect/google` endpoint. The user logs in with Google, and the backend sends back a JWT token in the response. 

As of now, we can't catch the response in the frontend because the new window is on a different domain. We need to use the `postMessage` API to send the JWT token from the backend to the frontend.

```ts
// src/stores/auth.ts
const loginWith = async (service: 'google') => {
  window.open(`http://localhost/connect/${service}`)
  window.addEventListener('message', receiveMessage) // [!code ++]
}

const receiveMessage = (event: MessageEvent) => { // [!code ++:7]
  if (event.data.type === 'authentication') {
    jwt.value = event.data.token
    window.removeEventListener('message', receiveMessage)
    loadCurrentUser()
  }
}
```

The Lxik JWT bundle sends the JWT token in the response with the `application/json` content type. If we want to use the `postMessage` API, we need to send the response with the `text/html` content type and add the required script to the response.

To do that, we need to create a custom response handler that uses the `lexik_jwt_authentication.handler.authentication_success` service. Here is how I did it:

```php
// src/Security/OAuthJwtSuccessHandler.php
namespace App\Security;

use Lexik\Bundle\JWTAuthenticationBundle\Security\Http\Authentication\AuthenticationSuccessHandler;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Http\Authentication\AuthenticationSuccessHandlerInterface;

class OAuthJwtSuccessHandler implements AuthenticationSuccessHandlerInterface
{
    public function __construct(
        // This is auto injected by Symfony
        private AuthenticationSuccessHandler $jwtSuccessHandler, // [!code highlight]
    ) {
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token): ?Response {
        $response = $this->jwtSuccessHandler->onAuthenticationSuccess($request, $token); // [!code highlight]
        $body = json_decode($response->getContent(), true);
        $jwt = $body['token'];

        return new Response('<html><body><script>
            window.opener.postMessage({
                type: \'authentication\',
                token: ' . json_encode($jwt) . ', // [!code highlight]
            }, \'*\');
            window.close(); // [!code highlight]
        </script></body></html>');
    }
}
```

Notice how I replaced the `JWTAuthenticationBundle` response with a custom one with the bare minimum to send the JWT token to the frontend. Also, the window will close itself once the token is sent.

Now, we need to configure this new handler in our `security.yaml`:

```yml
# config/packages/security.yaml
security:
  firewalls:
    main:
      # ...
      oauth:
        # ...
        success_handler: lexik_jwt_authentication.handler.authentication_success // [!code --]
        success_handler: App\Security\OAuthJwtSuccessHandler # This is our custom handler // [!code ++]
```

Now, when the user logs in with Google, the backend sends the JWT token to the frontend using the `postMessage` API. The frontend can now store the JWT token in the `localStorage` and use it to authenticate with the API.

```ts
// src/stores/auth.ts
const jwt = ref<string | null>(null) // [!code --:2]
const currentUser = ref<User | null>(null)
const stored = JSON.parse(localStorage.getItem('auth') || 'null') // [!code ++:3]
const jwt = ref<string | null>(stored ? stored.jwt : null)
const currentUser = ref<User | null>(stored ? stored.currentUser : null)

// ...

// Any time the JWT token or the current user changes, we store them in the localStorage
watch([jwt, currentUser], () => {  // [!code ++:3]
  localStorage.setItem('auth', JSON.stringify({ jwt: jwt.value, currentUser: currentUser.value }))
})
```

Congrats! You now have a way to log your users in with Google OAuth and authenticate them with your API using a JWT token.

But... there is one more thing. Because your new users are not registered in your database, so you got this weir 

## Registering users after OAuth success

`HWIOAuthBundle` provides a way to register users, it's called `connect`. I'm sure it works great, but it relies on Symfony forms and I don't want to use them as I'm using Vue.js. I want my users to be registered automatically after they log in with Google.

Also, when I tried to buypass the form step, I got this error:

```
Account could not be linked correctly. // [!code error]
```

After hours of debugging and searching online, I gave up using this `connect` feature. However, I found that the class [`EntityUserProvider.php`](https://github.com/hwi/HWIOAuthBundle/blob/c9cd9f2ffa55a353b6902eb811315ebd3782d3bd/src/Security/Core/User/EntityUserProvider.php) from `HWIOAuthBundle` was in charge of retrieving the user from the database. I decided to override it to create a new user if it doesn't exist instead of throwing an exception.

I won't print the whole class here, but you can find it in the link above. Here is the part I changed:

```php
// src/Security/EntityUserProvider.php
public function loadUserByOAuthUserResponse(UserResponseInterface $response): ?UserInterface
{
    $resourceOwnerName = $response->getResourceOwner()->getName();

    if (!isset($this->properties[$resourceOwnerName])) {
        throw new \RuntimeException(sprintf("No property defined for entity for resource owner '%s'.", $resourceOwnerName));
    }

    $username = method_exists($response, 'getUserIdentifier') ? $response->getUserIdentifier() : $response->getUserIdentifier();
    if (null === $user = $this->findUser([$this->properties[$resourceOwnerName] => $username])) {
        throw $this->createUserNotFoundException($username, sprintf("User '%s' not found.", $username)); // [!code --]
        $user = $this->registerUser($response); // [!code ++]
    }

    return $user;
}

private function registerUser(UserResponseInterface $response): UserInterface // [!code ++:9]
{
    /** @var User */
    $user = new $this->class();
    $user->loadUserByOAuthUserResponse($response);
    $this->em->persist($user);
    $this->em->flush();

    return $user;
}
```

Still, we need to tell `HWIOAuthBundle` to use our custom `EntityUserProvider` service. Here is how I did it:

```yml
# config/services.yaml
services:
  # ... other services
  hwi_oauth.user.provider.entity:
    class: App\Security\EntityUserProvider
    arguments:
      $class: App\Entity\User
      $properties:
        'google': 'googleId'
```

And finally, if our users logged in with Google aren't registered in our database yet, they will automatically be.

## Conclusion

In this article, I showed you how to log your users in with Google OAuth and authenticate them with your API using a JWT token. I hope you found it helpful. If you have any questions or feedback, feel free to reach out to me on X ([@d9beuD](https://x.com/d9beuD)).