exec:
	bundle exec jekyll serve -H localhost -l --drafts

build:
	bundle exec jekyll build

install:
	bundle config set path 'vendor/bundle'
	bundle config build.posix-spawn --with-cflags="-Wno-incompatible-function-pointer-types"
	bundle config build.eventmachine --with-ldflags="-Wl,-undefined,dynamic_lookup"
	bundle install

update-gem:
	gem update --system