# Curatarr Audit TODO 


1) "Library path must not be a symlink" — Add clear explanation for users. Document why this is enforced and describe what can go wrong if users run Curatarr from Docker or a NAS box with symlinked library roots.

2) `packages/curatarr/src/ui/src/pages/Scan.tsx`

The plain text guide in this component can be enhanced visually. Determine where and how this is displayed—confirm if it is surfaced in the UI or still in use.  
Example from the guide:
  Matched movies are enriched with Jellyfin metadata:
    ratings, genres, IMDb/TMDb IDs, overview.

Note: In the above example, "overview" has been removed from the database and is not shown to users in the movie details. Curatarr is not a metadata visualization tool; it only stores basic metadata needed for library curation. Original, full metadata exists in Jellyfin. Ensure this distinction is mentioned in agents and the README if not already covered.

3) Full accessibility (A11y) support is needed across all UI widgets. Ensure the UI is tested for accessibility compliance.

4) Content should be isolated from code to allow internationalization (i18n).  
  Content labels locally scoped to component folders can be useful.
   Adopt a framework that supports both localization at the component level and a shared content space for common terms. 
   Choose a popular i18n tool suitable for large-scale open source projects with multi-language support—do not create a custom solution or reinvent existing approaches over community practices.  
   Create a thorough approach document in `temp/` and complete implementation after review.

5) Setting > General and Settings> Socut need to be separated out at menu lefy on left Side panel. Then the accordion block for Genral vs Scout and coloring etc can be removed.
   Settings can now be indepndently saved as general and scount settings

6) README.md and vision need to be dopted text under # Curatarr is not from consumer/end user end pint and it talks about tech stuff based on which curatarr is built. this is not whats needed. this need to be priduct centric and user cewntric. 
Adopt or use this aas such in both README. And map it to vision as well.

Curatarr is aimed at being a central movie management tool that improves the experience of scouting release of movies (with series support coming soon) and automated quality improvement based on user-defined rulesoon top of community rules like Trash.

 How is it different from radarr? 
 The UX of managing TrashScore overrides and custom rules often requires duplication and managing configuration across different tools like Radarr, Sonarr, and Recyclarr, only to result in scores that get into close ties with each other making automated release section difficult. 
 
 Curatarr offers an LLM-based workflow that can optionally be added on top of deterministic scoring of releases using meta data-based rules (critic scores, etc.), Trash scores, and user-defined CF rules.

Curatarr is not for everyone. It is for those who want to avoid managing different 'quality profile'-based pipelines that share the same CF scores, and instead have one set of rules to govern your library and let an LLM decide when there are ties.
