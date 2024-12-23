---
    title: Log your users in with Google OAuth, API Platform and Vue.js
    tags: symfony api-platform google oauth php api vue
    date: 2024-04-19 20:43:00 +02:00
---

I recently started a new project using **Symfony 7**, **API Platform**, and **Vue.js 3**. I wanted to allow users to log in or register with their Google account. Here is how I did it.

First, like you probably did, I looked online for a bundle that would help me with that. I found [`knpuniversity/oauth2-client-bundle`](https://github.com/knpuniversity/oauth2-client-bundle) which was promising. Reading in their `README.md`, I saw the following:

> Not sure which to use? If you need OAuth (social) authentication & registration, try [hwi/oauth-bundle](https://github.com/hwi/HWIOAuthBundle). If you don't like it, come back!

So what they say is that `HWIOAuthBundle` is exactly what I need? Yeah, but no. It's not that simple. I'll explain why and give you a solution.

## The idea

The idea is to use `HWIOAuthBundle` to authenticate users with Google. Once authenticated, we will generate a JWT token with [`lexik/jwt-authentication-bundle`](https://github.com/lexik/LexikJWTAuthenticationBundle) and send it back to the user. The user will then use this token to authenticate with our API.

It works great if the Symfony application is handling the frontend. But in our case, **we are using Vue.js**. The problem is that OAuth applications are not allowed to have multiple redirect URIs (it's the URI where the OAuth server responds with its access token). So we can't have one for the Symfony application and one for the Vue.js application.

Because the OAuth process is handled by the Symfony application, when the user triggers the login with Google from the Vue.js frontend, we need to open a new window to the backend. The backend will redirect to the Google SSO page, allowing the user to enter its credentials. Once the user is authenticated, Google redirects to the backend with an access token within query parameters, then the backend will send the JWT token back to the frontend.

[![](https://mermaid.ink/svg/pako:eNp9kLFOAzEMhl_F8sJA7wUydChIRQgJpIJYbjGJ256ac0KcqEJV352kd4BgIEPkX_6c_P5PaINjNKj8Xlgs3w60SzT2AvWsUjgqp265nCsDL_UG6wd7UOjxJoiwzXAc8h7WIew89_h39vopxBINPEYWhRhiV-LEXBqNWJE9sDgDD4Gcwtsk54cm0Ux8UWvOOn93pZBYYxDlf3DhRJnh_vX5N1Spbna3qVp_iMla63-vfkfiPF8YXODIaaTB1ehObaLHvOexbm9q6XhLxecWxbmiVHLYfIhFk1PhBZboqps5aTRb8srnT4F_gyA)](https://mermaid.live/edit#pako:eNp9kL1uQjEMhV_F8tIBeIEMDLQSVVWJSlB1uYubGLgi10njRKhCvHsDN_0RQzNEPvIX5_ic0AbHaFD5o7BYfuhpl2joBOpZpHBUTrP5fNJKA6_1But7e1Do8D6IsM1w7PMeliHsPHd4-_glxBINrCKLQgxxVuKIXBsVWJA9sDgDz4Gcwvso25hR_KWWnLV9dqeQWGMQ5X9w4USZ4eltcws1a-uq9Lf_4-t76UcS5_lK4BQHTgP1rqZ2uvAd5j0PdW9TS8dbKj5fQjhXlEoO60-xaHIqPMUSXXXSQkazJa98_gJgh4JB)

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

Say the user successfully logs in with Google, `HWIOAuthBundle` needs a service that is able to load users based on the user response of the OAuth endpoint. As I am using Doctrine ORM to store my users, I chose the `hwi_oauth.user.provider.entity` service.

```yml
# config/services.yaml
services:
  # ... other services
  hwi_oauth.user.provider.entity:
    class: HWI\Bundle\OAuthBundle\Security\Core\User\EntityUserProvider
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

Now, when we visit the URL `/connect/google` and log in using Google, we receive a JSON Web Token (JWT) in the response. However, we cannot utilize it immediately because we need to send it back to the frontend.

```
{ "token": "..." }
```

## Retrieve the JWT token from the backend

Our frontend is a Vue.js application hosted on a different domain from our Symfony application. Due to the [SameSite cookie attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite), we can’t use cookies to store the JWT token. Instead, we’ll store the JWT token in `localStorage`.

The examples I’ll provide are adapted for Vue.js 3, but they’re easily adaptable to any JavaScript framework.

To handle authentication, I created an `auth` store based on [Pinia](https://pinia.vuejs.org):

```ts
// src/stores/auth.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

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

Now, when the user clicks the « Login with Google » button, a new window opens, redirecting the user to the `/connect/google` endpoint. The user authenticates with Google, and the backend responds with a JWT token.

Currently, we can’t intercept the response in the frontend because the new window is on a different domain. To resolve this, we need to utilize the `postMessage` API to send the JWT token from the backend to the frontend.

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

The Lexik JWT bundle sends the JWT token in the response with the `application/json` content type. However, if we intend to use the `postMessage` API, we must send the response with the `text/html` content type and include the necessary script in the response.

To accomplish this, we need to create a custom response handler that utilizes the `lexik_jwt_authentication.handler.authentication_success` service. Here’s how I implemented it:

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

Notice how I replaced the `JWTAuthenticationBundle` response with a custom one that includes only the essential elements to send the JWT token to the frontend. Additionally, the window will automatically close itself once the token is transmitted.

Next, we must configure this newly created handler in our `security.yaml` file.

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

Now, when a user logs in using Google, the backend sends the JWT token to the frontend using the `postMessage` API. The frontend can then store the JWT token in the `localStorage` and use it to authenticate with the API.

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

Congratulations! You now have a method to log in users with Google OAuth and authenticate them with your API using a JWT token.

However, there’s one additional step. Since your new users aren’t registered in your database yet. 

## Registering users after OAuth success

The `HWIOAuthBundle` offers a user registration mechanism called `connect`. While I’m confident it functions effectively, it relies on Symfony forms, which I’m refraining from using since I’m opting for Vue.js instead. My intention is to have users automatically registered upon their successful Google login.

Additionally, when attempting to buypass the form step, I encountered an error.

```
Account could not be linked correctly. // [!code error]
```

After hours of debugging and searching online, I abandoned using this `connect` feature. However, I discovered that the class [`EntityUserProvider.php`](https://github.com/hwi/HWIOAuthBundle/blob/c9cd9f2ffa55a353b6902eb811315ebd3782d3bd/src/Security/Core/User/EntityUserProvider.php) from `HWIOAuthBundle` was responsible for retrieving the user from the database. Instead of throwing an exception, I decided to override it and create a new user if it didn’t exist.

I won’t provide the entire class here, but you can find it in the link above. Here’s the part I modified:

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

Despite this, we must instruct the `HWIOAuthBundle` to utilize our custom `EntityUserProvider` service. Here’s how I accomplished it:

```yml
# config/services.yaml
services:
  # ... other services
  hwi_oauth.user.provider.entity:
    class: HWI\Bundle\OAuthBundle\Security\Core\User\EntityUserProvider // [!code --]
    class: App\Security\EntityUserProvider // [!code ++]
    arguments:
      $class: App\Entity\User
      $properties:
        'google': 'googleId'
```

And finally, if our users log in using Google OAuth and haven’t been registered in our database yet, they’ll be automatically registered.

## Conclusion

In this article, we explored how to log in users with Google OAuth and authenticate them with your API using a JWT token. I hope you found it helpful. If you have any questions or feedback, please don’t hesitate to reach out to me on X ([@d9beuD](https://x.com/d9beuD)).