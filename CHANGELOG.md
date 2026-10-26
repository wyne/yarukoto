# Changelog

## [1.5.0](https://github.com/wyne/yarukoto/compare/v1.4.0...v1.5.0) (2026-10-26)


### Features

* ⌘↩ in a subtask checks off that subtask ([#280](https://github.com/wyne/yarukoto/issues/280)) ([b9f700d](https://github.com/wyne/yarukoto/commit/b9f700d79fff0555cd7ac2efbbfc523198bf8d8b))
* archive old completed tasks and expire trash on every device ([#282](https://github.com/wyne/yarukoto/issues/282)) ([e00e8ea](https://github.com/wyne/yarukoto/commit/e00e8eacbdbfc20576821fcd4f22bc6cc6e4e6da))
* close ⌘K, ⌘O and ⌘/ by pressing the same key again ([#279](https://github.com/wyne/yarukoto/issues/279)) ([0c1546b](https://github.com/wyne/yarukoto/commit/0c1546b4fa3f10372b4c47068fe06fb8d89bf1d6))
* desktop text size, denser task list and narrower window ([#274](https://github.com/wyne/yarukoto/issues/274)) ([414ebeb](https://github.com/wyne/yarukoto/commit/414ebebae15bca8b2b0771479ba5d4b645dd700d))
* vim keys for the desktop task list ([#276](https://github.com/wyne/yarukoto/issues/276)) ([2561632](https://github.com/wyne/yarukoto/commit/25616320a15fda88cf448a39a1ecc55f272383e2))


### Bug Fixes

* float the task pane over the list when a desktop window is too narrow for a column ([#281](https://github.com/wyne/yarukoto/issues/281)) ([fbe9953](https://github.com/wyne/yarukoto/commit/fbe99532a0efa9f5d5eace80c4e63539639a36dd))
* show ⌘K, ⌘O and ⌘/ in one menu so switching between them works ([#277](https://github.com/wyne/yarukoto/issues/277)) ([2b25215](https://github.com/wyne/yarukoto/commit/2b252157d015446703404b203451a83d4c91231e))


### Documentation

* feature vim keys, the shared ⌘K/⌘O/⌘/ menu, Agenda and desktop text size ([#278](https://github.com/wyne/yarukoto/issues/278)) ([9505c10](https://github.com/wyne/yarukoto/commit/9505c10f04d694ac2e82a13ffb6df95ce7b2fd7c))

## [1.4.0](https://github.com/wyne/yarukoto/compare/v1.3.0...v1.4.0) (2026-10-24)


### Features

* fold a task's empty fields into an icon tray ([#270](https://github.com/wyne/yarukoto/issues/270)) ([cc4cb01](https://github.com/wyne/yarukoto/commit/cc4cb01549e7a99e22fc150a3ad351822934b46b))
* offer View when a new task lands outside the current view ([#267](https://github.com/wyne/yarukoto/issues/267)) ([b3c61fd](https://github.com/wyne/yarukoto/commit/b3c61fde6253d76ebf5e2eb2857b5d98b2fa66a2))
* open today's tasks from the menu bar and tray, mark done as the secondary action ([#269](https://github.com/wyne/yarukoto/issues/269)) ([1723b2a](https://github.com/wyne/yarukoto/commit/1723b2a429ec74506edc1ecac18618c91d9aafe4))
* quick-add tools can clear or replace a typed token, and come to the desktop bar ([#262](https://github.com/wyne/yarukoto/issues/262)) ([157291f](https://github.com/wyne/yarukoto/commit/157291f4ad71d97651cdd81fa0fff47f16f17369))
* show each subtask change in task history ([#265](https://github.com/wyne/yarukoto/issues/265)) ([647ddf5](https://github.com/wyne/yarukoto/commit/647ddf5d4f142766bb379669c68efc04999a6f74))
* show each task's list in Activity ([#272](https://github.com/wyne/yarukoto/issues/272)) ([35eb1f6](https://github.com/wyne/yarukoto/commit/35eb1f6fe0cebeed2ccdb26a9814514a986baf90))
* Today becomes Agenda and shows the days ahead; Plan gives its calendar more room ([#266](https://github.com/wyne/yarukoto/issues/266)) ([f56cce4](https://github.com/wyne/yarukoto/commit/f56cce48a488858b1c1c62b1951d567dcb3f1e80))


### Bug Fixes

* coalesce local snapshot writes instead of one per edit ([#221](https://github.com/wyne/yarukoto/issues/221)) ([17c09ce](https://github.com/wyne/yarukoto/commit/17c09ceb31cd7f339fa7b2b01dd690e2d8e97833))
* drop the second heading from the Reminders and Repeat menus ([#273](https://github.com/wyne/yarukoto/issues/273)) ([92b205f](https://github.com/wyne/yarukoto/commit/92b205fd042fc0134721ad9034783970705afd1a))
* hide the custom order banner ([#260](https://github.com/wyne/yarukoto/issues/260)) ([ed8da39](https://github.com/wyne/yarukoto/commit/ed8da390e0f1b0da8a6646e3f796670840f66f9e))
* keep Go to Task's cursor when the list takes the keyboard before redrawing ([#264](https://github.com/wyne/yarukoto/issues/264)) ([1ee5805](https://github.com/wyne/yarukoto/commit/1ee580517996ecae7026acf340c6a9c8417bdc68))
* keep search dialogs anchored while filtering ([#259](https://github.com/wyne/yarukoto/issues/259)) ([f2981f0](https://github.com/wyne/yarukoto/commit/f2981f0860fdd9bebc94040fc1bdae1cb7448607))
* open and close the command and shortcut search without a fade ([#257](https://github.com/wyne/yarukoto/issues/257)) ([e5dbf06](https://github.com/wyne/yarukoto/commit/e5dbf06753f2ff2e2f1a819d4925baf669a303b9))
* opening Plan task on a phone no longer crashes ([#271](https://github.com/wyne/yarukoto/issues/271)) ([da4dc4e](https://github.com/wyne/yarukoto/commit/da4dc4e9ae425ff63ea3f5f7e26c2d794c0beeef))
* remember the collapsed sidebar across reloads ([#268](https://github.com/wyne/yarukoto/issues/268)) ([1e73196](https://github.com/wyne/yarukoto/commit/1e73196628c0b6a91774c79a37ba26e02b198d9f))

## [1.3.0](https://github.com/wyne/yarukoto/compare/v1.2.0...v1.3.0) (2026-10-20)


### Features

* **activity:** show notes edits as a line diff ([#242](https://github.com/wyne/yarukoto/issues/242)) ([22b171e](https://github.com/wyne/yarukoto/commit/22b171ef285ddc4fdf58f8292d4c114603a5968a))
* bring a newly added task into view and select it ([#251](https://github.com/wyne/yarukoto/issues/251)) ([36131c5](https://github.com/wyne/yarukoto/commit/36131c5ddfcd2937adbba80054a1c20f7fa9646d))
* improve command and shortcut search ([#253](https://github.com/wyne/yarukoto/issues/253)) ([bdeae73](https://github.com/wyne/yarukoto/commit/bdeae737a998133d64fadf6c570186a3f19320e5))
* open a newly added task beside the list and keep the last task tinted on phones ([#252](https://github.com/wyne/yarukoto/issues/252)) ([6e57760](https://github.com/wyne/yarukoto/commit/6e577607980cd40911decc56354fed65110af05c))
* rename the Calendar tab to Plan and add a workflow guide ([#255](https://github.com/wyne/yarukoto/issues/255)) ([2e9d046](https://github.com/wyne/yarukoto/commit/2e9d04630b1faab746c311d88a23c60d16fe900e))
* safer quick-add keys, Tab completion, and fix iOS highlight duplication ([#249](https://github.com/wyne/yarukoto/issues/249)) ([a38e7b2](https://github.com/wyne/yarukoto/commit/a38e7b2f01feaee808194e657ef7d6770d469c87))
* search open tasks by title with ⌘O ([#250](https://github.com/wyne/yarukoto/issues/250)) ([e8d8a6f](https://github.com/wyne/yarukoto/commit/e8d8a6f9c89a1242227f17216b40195fbc84aeb9))
* show a task's change history from the bottom of the task ([#244](https://github.com/wyne/yarukoto/issues/244)) ([09a531b](https://github.com/wyne/yarukoto/commit/09a531b46c056bfddf18ecc10dce86ddd679e303))
* show the app version in Settings on phone and web ([#239](https://github.com/wyne/yarukoto/issues/239)) ([f274ae6](https://github.com/wyne/yarukoto/commit/f274ae69137f45c8d392a00c58570c89d1e981d1))
* swap the swipe menu's Done for Next week ([#248](https://github.com/wyne/yarukoto/issues/248)) ([95a884e](https://github.com/wyne/yarukoto/commit/95a884e134bfea88443748e772c93d7c706d2f09))
* tint quick-add tokens where they're typed ([#243](https://github.com/wyne/yarukoto/issues/243)) ([96a7267](https://github.com/wyne/yarukoto/commit/96a72671f9adcae2c523bcb9708d522acfb56613))
* **windows:** add a notification area icon with open at login ([#240](https://github.com/wyne/yarukoto/issues/240)) ([08f7cf9](https://github.com/wyne/yarukoto/commit/08f7cf9ae25751573cf383579d0a583fe98cc75c))


### Bug Fixes

* keep right-click menus inside the window ([#245](https://github.com/wyne/yarukoto/issues/245)) ([d0e5369](https://github.com/wyne/yarukoto/commit/d0e53699adfde8c545d86908199ace6b3f41c026))
* **web:** bring the sidebar row into view from the real scroll position ([#247](https://github.com/wyne/yarukoto/issues/247)) ([ef743f7](https://github.com/wyne/yarukoto/commit/ef743f7c7a2166bc0c23ab306c882904a6a9fcc0))
* **web:** scroll the task list to keep the cursor row in view ([#241](https://github.com/wyne/yarukoto/issues/241)) ([9d8db0a](https://github.com/wyne/yarukoto/commit/9d8db0a041a36d2fbdf332248b53fefe3e4a4b25))

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
