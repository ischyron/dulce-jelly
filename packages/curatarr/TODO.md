# TODO 

### Ground rules
- Always read the todo from disk as human would keep this updated and so latest status and feedback on tasks is important
- Always read the TODO from disk, as the human keeps this updated and the latest status and feedback on tasks are important.
- Work through todos independently; pause only if human review is required.
- Strike out when done/blocked.
- Don't create new sections for TODOs or bugs. Keep status inline.
- Process to mark a TODO  as DONE or closure of any work item.
  - develop feature/fix with all edge cases considred
  - unit/interaction test if any need to commit
  - run e2e test 
  - commit and push changed to git.
  - deploy it on docker
  - Then mark as complete or done
  - Follow up questions if any edge cases left unhanlded due to lack of requirement clarity


## TODO Items


- [BLOCKED] ~~Full accessibility (A11y) support is needed across all UI widgets. Ensure the UI is tested for accessibility compliance.~~  
  Automated axe-based accessibility auditing is now added (`test/a11y.spec.cjs`), but full UI compliance is still blocked by existing app-wide contrast and form-label violations across legacy widgets.

- [DONE] ~~Content should be isolated from code to allow internationalization (i18n).  
    Content labels locally scoped to component folders can be useful.  
    Adopt a framework that supports both localization at the component level and a shared content space for common terms.  
    Choose a popular i18n tool suitable for large-scale open source projects with multi-language support—do not create a custom solution or reinvent existing approaches over community practices.  
    Create a thorough approach document in `temp/` and complete implementation after review.~~

- [DONE] ~~Setting > General and Settings > Scout need to be separated out at menu left on Left Side panel. Then the accordion block for General vs Scout and coloring etc can be removed.  
    Settings can now be independently saved as general and scout settings.~~

- [DONE] ~~README.md and vision need to be adopted text under # Curatarr is not from the consumer/end user end point and it talks about tech stuff based on which Curatarr is built. This is not what's needed. This needs to be product centric and user centric.  
  Adopt or use this as such in both README. And map it to vision as well.

  Curatarr is aimed at being a central movie management tool that improves the experience of scouting release of movies (with series support coming soon) and automated quality improvement based on user-defined rules on top of community rules like Trash.

   How is it different from Radarr?  
   The UX of managing TrashScore overrides and custom rules often requires duplication and managing configuration across different tools like Radarr, Sonarr, and Recyclarr, only to result in scores that get into close ties with each other making automated release selection difficult. 

   Curatarr offers an LLM-based workflow that can optionally be added on top of deterministic scoring of releases using metadata-based rules (critic scores, etc.), Trash scores, and user-defined CF rules.

  Curatarr is not for everyone. It is for those who want to avoid managing different 'quality profile'-based pipelines that share the same CF scores, and instead have one set of rules to govern your library and let an LLM decide when there are ties.~~

- [DONE] ~~Biome lint has this issue and errors and prevents commit when only .md files are changed

  > curatarr@0.2.0 lint:fix
  > biome lint . --write

  Checked 125 files in 42ms. No fixes applied.
  [pre-commit] curatarr biome check (staged files)
  Checked 0 files in 60µs. No fixes applied.
  internalError/io ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    ✖ No files were processed in the specified paths.~~
