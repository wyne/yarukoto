# Changelog

## [1.2.0](https://github.com/wyne/yarukoto/compare/v1.1.0...v1.2.0) (2026-10-19)


### Features

* Go to places, Move to List and Edit Tags pickers in ⌘K ([#231](https://github.com/wyne/yarukoto/issues/231)) ([0ffd38c](https://github.com/wyne/yarukoto/commit/0ffd38caa7cce44d2296a3aac441e3911100e974))
* group and sort from ⌘K, tag search, and ⌘-hold shortcut hints ([#228](https://github.com/wyne/yarukoto/issues/228)) ([113039b](https://github.com/wyne/yarukoto/commit/113039b06ce0d3c376979e44871a3eec85586fc7))


### Bug Fixes

* **activity:** refresh the feed after syncs, drop the bell, add quick filters ([#234](https://github.com/wyne/yarukoto/issues/234)) ([117a7fe](https://github.com/wyne/yarukoto/commit/117a7feae9f31c7cef4f16cbbaf346eed5664d33))
* **android:** let the composer's list, tag and priority menus scroll ([#233](https://github.com/wyne/yarukoto/issues/233)) ([246a1ea](https://github.com/wyne/yarukoto/commit/246a1ea595a34c7d9116bbd7cb2c50b5af1235ae))
* **demo:** refresh the demo kit from main on the nightly reset ([#235](https://github.com/wyne/yarukoto/issues/235)) ([69a3121](https://github.com/wyne/yarukoto/commit/69a3121afea05102139b52b09797dc6e871e3553))
* **desktop:** keep the sidebar as a rail on narrow windows, and show and take its keyboard focus ([#236](https://github.com/wyne/yarukoto/issues/236)) ([6acf1ad](https://github.com/wyne/yarukoto/commit/6acf1ad6e6eeb4d5d4aea389c93956e47cb30c91))
* **notes:** grow the notes editor with its text on the web and Windows ([#237](https://github.com/wyne/yarukoto/issues/237)) ([7d1c424](https://github.com/wyne/yarukoto/commit/7d1c424ec2d7035437d48353f2b02cc430e180f3))
* report the app release version from the server instead of a fixed 1.0.0 ([#229](https://github.com/wyne/yarukoto/issues/229)) ([f7cc05b](https://github.com/wyne/yarukoto/commit/f7cc05bd1aa35399cbc0233e3c57c5a18b11e51a))
* **web:** replace the browser focus ring on text fields with an accent frame ([#232](https://github.com/wyne/yarukoto/issues/232)) ([d2db98b](https://github.com/wyne/yarukoto/commit/d2db98bae28988341b3d218521bebf59523dd430))
* **web:** theme the reminder picker instead of a bare select ([#238](https://github.com/wyne/yarukoto/issues/238)) ([e7be2dc](https://github.com/wyne/yarukoto/commit/e7be2dc5b98ddb67d9e5e7d9dbf4f303d5d286c7))

## [1.1.0](https://github.com/wyne/yarukoto/compare/v1.0.0...v1.1.0) (2026-10-18)


### Features

* add a Mac menu bar extra with open at login ([#227](https://github.com/wyne/yarukoto/issues/227)) ([51a4c16](https://github.com/wyne/yarukoto/commit/51a4c16d2149f35703da8089aa139318d56b2e5b))
* add desktop update checks ([#218](https://github.com/wyne/yarukoto/issues/218)) ([664bec6](https://github.com/wyne/yarukoto/commit/664bec6af1bc558cbc2c124be8d9a017de51c8a7))
* replace the task completion sound with a softer rolled chord ([#220](https://github.com/wyne/yarukoto/issues/220)) ([1ba5863](https://github.com/wyne/yarukoto/commit/1ba5863aa8f7ba1608e9cc33bdc71fda9df6a43d))


### Bug Fixes

* **desktop:** keep desktop shapes when the window narrows ([#226](https://github.com/wyne/yarukoto/issues/226)) ([57e61b4](https://github.com/wyne/yarukoto/commit/57e61b49237bd586920470fdf53ac31d33078b59))
* make task sheet scroll on initial load ([#219](https://github.com/wyne/yarukoto/issues/219)) ([78de7a2](https://github.com/wyne/yarukoto/commit/78de7a2a19d875981892930417c35879e01fc583))
* make the Mac app keep up with window resizing ([#224](https://github.com/wyne/yarukoto/issues/224)) ([83e9ef3](https://github.com/wyne/yarukoto/commit/83e9ef377e4a1b1b6eeb013ecf2a2582c01dede0))
* remove "never leaves your server" from the sign-in screen ([#225](https://github.com/wyne/yarukoto/issues/225)) ([42c58f9](https://github.com/wyne/yarukoto/commit/42c58f91aadf0dc6de6966a2a165e72a2ff1a6ad))
* right-align task detail menu values ([#222](https://github.com/wyne/yarukoto/issues/222)) ([15fbf47](https://github.com/wyne/yarukoto/commit/15fbf473bd0c109a852f0d17266e521536a3f0a4))


### Documentation

* add MIT license ([#217](https://github.com/wyne/yarukoto/issues/217)) ([608bc38](https://github.com/wyne/yarukoto/commit/608bc38cda375aa7786e0ed6a232f8726f0d597e))


### Infrastructure

* allow release rebuild dispatch without a tag ([#223](https://github.com/wyne/yarukoto/issues/223)) ([b6f32b9](https://github.com/wyne/yarukoto/commit/b6f32b9eeb48e408afdbab54fc391c9f6d58c23b))
* fix EAS release preflight path ([#215](https://github.com/wyne/yarukoto/issues/215)) ([8688340](https://github.com/wyne/yarukoto/commit/86883402cc6cebdbc39dda1dd9569d65edeb5966))

## 1.0.0 (2026-10-10)


### Features

* **desktop:** keyboard navigation between panes, and Cmd-1 to 7 for views ([#211](https://github.com/wyne/yarukoto/issues/211)) ([1a12503](https://github.com/wyne/yarukoto/commit/1a1250388e0ffa4acba8861a95dd3e4a832f1486))
* **desktop:** sidebar keys, list jumps, Return to edit, and a shortcuts sheet ([#213](https://github.com/wyne/yarukoto/issues/213)) ([f9f4e5f](https://github.com/wyne/yarukoto/commit/f9f4e5f2cc813d67da90719b711e0c84b13e697c))
* split Home Assistant and automate app releases ([#207](https://github.com/wyne/yarukoto/issues/207)) ([58efa4a](https://github.com/wyne/yarukoto/commit/58efa4a15a28ef8019e4dff6411b424dcb9d3461))


### Bug Fixes

* **desktop:** keep Up and Down in the task list from re-rendering the app ([#212](https://github.com/wyne/yarukoto/issues/212)) ([37cc7bf](https://github.com/wyne/yarukoto/commit/37cc7bfb054d0802f0d06a7ee19d25615e721778))
* **desktop:** re-render only the rows the cursor moved between ([#214](https://github.com/wyne/yarukoto/issues/214)) ([3a04149](https://github.com/wyne/yarukoto/commit/3a04149d3bc3d3f3f9780811eed15137f1126b16))
* install workspace deps at the root before Mac scripts call expo ([#210](https://github.com/wyne/yarukoto/issues/210)) ([19ec469](https://github.com/wyne/yarukoto/commit/19ec469678941652956cfc77f7f8bad003ba41c3))


### Infrastructure

* check the PR's own commit title, not the merge commit ([#209](https://github.com/wyne/yarukoto/issues/209)) ([cca3f5c](https://github.com/wyne/yarukoto/commit/cca3f5c81f88ecdb9de4b5b18f9d5cb760d2bd32))
