### define
underscore : _
backbone.marionette : marionette
routes : routes
###

class CreditsView extends Backbone.Marionette.ItemView

  className : "well"
  id : "credits"
  template : _.template("""
    <div class="container">
      <h3>Oxalis Credits</h3>
      <section class="row">
        <div class="col-sm-4">
          <h4>Max Planck Institute of Neurobiology</h4>
          <p>
            Structure Of Neocortical Circuits<br />
            <a href="http://www.neuro.mpg.de/helmstaedter">http://www.neuro.mpg.de/helmstaedter</a>
          </p>
          <ul>
            <li>Moritz Helmstaedter</li>
            <li>Manuel Berning</li>
            <li>Kevin Boergens</li>
            <li>Helge Feddersen</li>
          </ul>
        </div>
        <div class="col-sm-4">
          <h4>scalable minds</h4>
          <p><a href="http://scm.io">http://scm.io</a></p>
          <ul>
            <li>Tom Bocklisch</li>
            <li>Dominic Bräunlein</li>
            <li>Johannes Frohnhofen</li>
            <li>Tom Herold</li>
            <li>Philipp Otto</li>
            <li>Norman Rzepka</li>
            <li>Thomas Werkmeister</li>
            <li>Daniel Werner</li>
            <li>Georg Wiese</li>
          </ul>
        </div>
        <div class="col-sm-3">
          <a href="http://www.neuro.mpg.de/helmstaedter">
            <img class="img-responsive" src="assets/images/Max-Planck-Gesellschaft.svg">
          </a>
          <a href="http://www.neuro.mpg.de/helmstaedter">
            <img class="img-responsive" src="assets/images/Logo_MPI_cut.svg">
          </a>
          <a href="http://www.scm.io">
            <img class="img-responsive" src="assets/images/scalableminds_logo.svg">
          </a>
        </div>
      </section>
      <section>
        <p>Oxalis is using Brainflight technology for real time data delivery, implemented by <em>scalable minds</em></p>
      </section>
      <section>
        <p>
          The Oxalis frontend was partly inspired by Knossos:
        </p>
        <p>
          Helmstaedter, M., K.L. Briggman, and W. Denk,<br />
          High-accuracy neurite reconstruction for high-throughput neuroanatomy. <br/>
          Nat. Neurosci. 14, 1081–1088, 2011.<br />
          <a href="http://www.knossostool.org">http://www.knossostool.org</a>
        </p>
      </section>
      <section>
        <p>
          For more information about our project, visit <a href="http://www.brainflight.net">http://www.brainflight.net</a>.
        </p>

        <p>&copy; Max Planck Institut of Neurobiology, Structure Of Neocortical Circuits</p>
      </section>
        <p>
          <a href="/impressum">Legal notice</a>
        </p>
    </div>
  """)