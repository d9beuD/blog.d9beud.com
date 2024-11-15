---
    title: Fix Symfony ManyToMany relationships when using the FormBuilder
    tags: symfony php form-builder doctrine
    date: 2024-11-14 17:03:00 +01:00
---

It’s crucial to consider the relationships between your entities from the very beginning of your project. Failure to do so can result in substantial time wastage later on due to significant refactoring of your code base.

You might have noticed, after generating the CRUD operations for your entities using the `make:crud` command that `ManyToMany` relationships in forms don’t work as expected: it is not bidirectional in write operations. Let me illustrate this with a concrete example and explain how to resolve it.

## A Basic ManyToMany Relationship

Let’s say we have the following entities. An `Article` have a title, a content and an author. A `Tag` have a name and nothing more.

```php
# src/Entity/Article.php

namespace App\Entity;

use App\Repository\ArticleRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ArticleRepository::class)]
class Article
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private ?string $title = null;

    #[ORM\Column(type: Types::TEXT)]
    private ?string $content = null;
    
    // getters and setters
}
```



```php
# src/Entity/Tag.php

// ...
#[ORM\Entity(repositoryClass: TagRepository::class)]
class Tag
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private ?string $label = null;
    
    // getters and setters
}
```

An article can have multiple tags and tags can be associated to multiple articles. Therefore, we need to setup a `ManyToMany` relationship.

```php
# src/Entity/Article.php

#[ORM\Entity(repositoryClass: ArticleRepository::class)]
class Article
{
    // previous properties

    /** // [!code ++:5]
     * @var Collection<int, Tag>
     */
    #[ORM\ManyToMany(targetEntity: Tag::class, inversedBy: 'articles')]
    private Collection $tags;
    
    // getters and setters
}
```

```php
# src/Entity/Tag.php

// ...
#[ORM\Entity(repositoryClass: TagRepository::class)]
class Tag
{
    // previous properties
    
    /** // [!code ++:5]
     * @var Collection<int, Article>
     */
    #[ORM\ManyToMany(targetEntity: Article::class, mappedBy: 'tags')]
    private Collection $articles;
    
    // getters and setters
}
```

Our entities are ready, we can now generate the CRUD operations using Symfony commands.

```bash
symfony console make:crud Article
symfony console make:crud Tag
```

Don’t forget to apply your changes to the database schema.

```bash
symfony console make:migration
symfony console doctrine:migrations:migrate
```

If you’re familiar with Symfony, you can test the application by navigating to the relevant endpoints. `/article` and `/tag`Try creating new tags and articles without selecting relationships. By default, you can’t. However, you’ve noticed that you need to select at least a tag to create an article and at least an article to create a tag.

That’s because those relationships are mandatory in their respective FormTypes. It’s easy to remove them; follow these steps. We’ll also change the displayed label in the `select` input.

```php
# src/Form/TagType.php

$builder
    ->add('label')
    ->add('articles', EntityType::class, [
        'class' => Article::class,
        'choice_label' => 'id', // [!code --]
        'choice_label' => 'title', // [!code ++]
        'multiple' => true,
        'required' => false, // [!code ++]
    ])
;
```

```php
# src/Form/ArticleType.php

$builder
    ->add('title')
    ->add('content')
    ->add('tags', EntityType::class, [
        'class' => Tag::class,
        'choice_label' => 'id', // [!code --]
        'choice_label' => 'label', // [!code ++]
        'multiple' => true,
        'required' => false, // [!code ++]
    ])
;
```

At this point, we can create new articles and tags without manually selecting relationships between them. Give it a try. Does it work? Of course, it does.

Now, let’s edit one of your existing tags to select an article. Click the save button and then go to the edit form. You’ll notice that the previously selected article is no longer selected. **That’s precisely the issue I wanted to discuss today.**

## The Problem: Unidirectional Form Handling

Selecting an article from a tag does not work. However, the opposite path does. That means that our `ManyToMany` relationship is bidirectional in read operations but unidirectional in write operations. 

By default, as stated in this [StackOverflow answer](https://stackoverflow.com/a/77476586), Symfony’s form handling system is adding the relationship by reference, using the methods of `ArrayCollection`. Because there is an owning and an inverse side in `ManyToMany`, adding an entity to the inverse side `ArrayCollection` will have no effect.

## The solution

Adding the relationships by reference is not what we want, so we need to tell Symfony not to do so. 

When we look closer to our entities `Article::addTag` and `Tag::addArticle` methods, we can see that the inverse side (the Tag entity) is calling `Article::addTag` to add itself in the article’s `ArrayCollection` after adding the article in it’s own `ArrayCollection`.

```php
# src/Entity/Tag.php

public function addArticle(Article $article): static
{
    if (!$this->articles->contains($article)) {
        $this->articles->add($article);
        $article->addTag($this); // [!code highlight]
    }

    return $this;
}
```

Thankfully, the FormBuilder has an option to tell the form handling system to use our custom (but auto-generated) `add`/`remove` methods. This option is called `by_reference` and needs to by set to `false`.

```php
# src/Form/TagType.php

$builder
    ->add('label')
    ->add('articles', EntityType::class, [
        'class' => Article::class,
        'choice_label' => 'title',
        'multiple' => true,
        'required' => false,
        'by_reference' => false,  // [!code ++]
    ])
;
```

And, that’s all, you fixed your forms!

## Conclusion

Symfony’s FormBuilder struggles with bidirectional ManyToMany relationships in write operations. To fix this, set the `by_reference` option to `false` in the EntityType form field. This instructs Symfony to use the custom `add`/`remove` methods generated for the entities, ensuring bidirectional relationships in both read and write operations.
