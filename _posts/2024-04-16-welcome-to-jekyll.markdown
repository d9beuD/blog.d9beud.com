---
layout: post
title:  "Welcome to Jekyll!"
date:   2024-04-16 14:58:28 +0200
tags: jekyll update
---
You’ll find this post in your `_posts` directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run `jekyll serve`, which launches a web server and auto-regenerates your site when a file is updated.

Jekyll requires blog post files to be named according to the following format:

`YEAR-MONTH-DAY-title.MARKUP`

Where `YEAR` is a four-digit number, `MONTH` and `DAY` are both two-digit numbers, and `MARKUP` is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.

Jekyll also offers powerful support for code snippets:

```php
namespace App\Entity;

use ApiPlatform\Metadata\ApiResource; // [!code highlight:2]
use ApiPlatform\Metadata\Delete;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\UniqueConstraint(name: 'UNIQ_IDENTIFIER_EMAIL', fields: ['email'])]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Post(processor: UserPasswordHasher::class, validationContext: ['groups' => ['Default', 'user:create']]),
        new Get(
            uriTemplate: '/users/me', // [!code error]
            security: "is_granted('ROLE_USER') and object == user", // [!code warning]
            provider: CurrentUserProvider::class,
            openapi: new Operation(
                summary: 'Retrieves the current user',
            )
        ),
        new Get(), // [!code --]
        new Put(processor: UserPasswordHasher::class), // [!code ++]
        new Patch(processor: UserPasswordHasher::class),
        new Delete(),
    ],
    normalizationContext: ['groups' => ['user:read']],
    denormalizationContext: ['groups' => ['user:create', 'user:update']],
)]
class User extends Manager implements UserInterface, PasswordAuthenticatedUserInterface, OAuthAwareUserProviderInterface
{
    #[Groups(['user:read'])]
    private ?int $id;

    #[Assert\NotBlank]
    #[Assert\Email]
    #[Groups(['user:read', 'user:create', 'user:update'])]
    #[ORM\Column(length: 254)]
    private ?string $email = null;

    /**
     * @var list<string> The user roles
     */
    #[ORM\Column]
    private array $roles = [];

    public function __construct()
    {
        $this->memberships = new ArrayCollection();
        Test(name: 'test');
    }

    public function loadUserByOAuthUserResponse(UserResponseInterface $response): UserInterface {
        $this->setEmail($response->getEmail());
        $this->setFirstname($response->getFirstName());
        $this->setLastname($response->getLastName());
        $this->setAvatar($response->getProfilePicture());
        $this->setGoogleId($response->getUserIdentifier());

        return $this;
    }
}
```

Check out the [Jekyll docs][jekyll-docs] for more info on how to get the most out of Jekyll. File all bugs/feature requests at [Jekyll’s GitHub repo][jekyll-gh]. If you have questions, you can ask them on [Jekyll Talk][jekyll-talk].

[jekyll-docs]: https://jekyllrb.com/docs/home
[jekyll-gh]:   https://github.com/jekyll/jekyll
[jekyll-talk]: https://talk.jekyllrb.com/
