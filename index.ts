import Elysia from "elysia";
import { UserConfig, ViteDevServer } from "vite";
// @ts-ignore
import { elysiaConnectDecorate } from 'elysia-connect';
import html from "@elysiajs/html";



const isProduction = process.env.NODE_ENV === 'production';

const getTemplateHTML = async ( path?: string ) => {
    let file: string;
    file = await Bun.file( path || './index.html' ).text();
    if ( isProduction )
    {
        file = await Bun.file( './dist/client/index.html' ).text();
    }
    if ( !file )
    {
        file = `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <link rel="icon" type="image/svg+xml" href="/vite.svg" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Vite</title>
            <!--app-head-->
          </head>
          <body>
            <div id="root"><!--app-html--></div>
            <script type="module" src="/src/entry-client.ts"></script>
          </body>
        </html>
        `;
    }
    return file;

};

const opts = {
    entryServer: `${ process.cwd() }/src/entry-server.ts`,
    headReplace: '<!--app-head-->',
    htmlReplace: '<!--app-html-->',
    base: process.env.BASE || '/',
    indexHtml: await getTemplateHTML(),
    ssrManifest: isProduction
        ? await Bun.file( './dist/client/ssr-manifest.json' ).text()
        : undefined,
    vite: ( config?: UserConfig ) => {
        let viteConfig = config;
        viteConfig = {
            ...config,
            server: config?.server ?? { middlewareMode: true},
            appType: config?.appType ?? 'custom',
            build: config?.build ?? { ssr: true },
            base: config?.base ?? opts.base
        };
        return viteConfig;
    }

};

let vite: ViteDevServer;
const app = new Elysia()
    .use( html )
    .use( elysiaConnectDecorate() )
    .onBeforeHandle( async ( context ) => {
        let handled: any;

        let middleWare: any;
        //  isProduction ? sirv( './dist/client', { extensions: [] } ) : vite.middlewares;
        if ( !isProduction )
        {
            const { createServer } = await import( 'vite' );
            vite = await createServer( opts.vite() );
            middleWare = vite.middlewares;
        } else
        {
            const sirv = ( await import( 'sirv' ) ).default;
            middleWare = sirv( './dist/client', { extensions: [] } );
        }
        // @ts-ignore elysia-connect library does not include their types in package.json
        handled = await context.elysiaConnect( middleWare, context );

        if ( handled ) return handled;

    } )
    .get( "*", async ( context ) => {
        const url = context.request.url;

        let template: string = opts.indexHtml;

        let render: any;
        if ( !isProduction )
        {

            template = await vite.transformIndexHtml( url, template );
            render = ( await vite.ssrLoadModule( opts.entryServer ) ).render;
        } else
        {
            render = ( await import( './dist/server/entry-server.js' ) ).render;
        }

        try
        {

            const ssrManifest = opts.ssrManifest;
            const rendered = await render( url, ssrManifest );
    
            const html = template
                .replace( opts.headReplace, rendered.head ?? '')
                .replace( opts.htmlReplace, rendered.html ?? '');

            return context.html( html );

        } catch ( error )
        {
            if ( !isProduction )
            {
                vite.ssrFixStacktrace( error as Error );

            } else
            {
                console.log( error , 'logged');
            }
            context.set.status = 500;
            return 'error';

        }

    } )
    .listen( 5173,
        (app) => console.log( ' Server started at http://' + app.hostname+ ':' + app.port ) );
